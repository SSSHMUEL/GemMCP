'use strict';

/**
 * משימות איסוף למסד המקומי.
 *
 * הרעיון: במקום לסרוק את המחשב מחדש בכל בקשה, סורקים פעם אחת ושומרים.
 * הסריקה החיה של תוכנה בודדת ב-resolve-app לוקחת שמונה עד עשר שניות, כי
 * היא עוברת על כל תפריט התחל רקורסיבית ועל Get-StartApps. אחרי איסוף אחד,
 * אותה שאלה נענית מקובץ JSON במילישניות - וגם עובדת כשאין חיבור לכלום.
 *
 * כל משימה כאן היא לקריאה בלבד: היא מתארת את המחשב, לא משנה אותו. אף אחת
 * מהן אינה מקבלת קלט מהמשתמש, ולכן אין כאן שום ערך שנכנס לתוך סקריפט -
 * הסקריפטים קבועים לחלוטין.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS_TIMEOUT_MS = 90000;

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        timeout: PS_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
      (err, stdout) => {
        if (err) return reject(new Error(err.killed ? 'הסריקה לא הסתיימה בזמן' : err.message));
        const text = String(stdout || '').trim();
        if (!text) return resolve([]);
        try {
          const parsed = JSON.parse(text);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (e) {
          reject(new Error('פלט הסריקה אינו JSON תקין'));
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 1. תוכנות מותקנות - איפה כל תוכנה נמצאת ואיך פותחים אותה
// ---------------------------------------------------------------------------
const APPS_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$out = New-Object System.Collections.ArrayList',
  '$roots = @(',
  '  "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",',
  '  "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths"',
  ')',
  'foreach ($root in $roots) {',
  '  foreach ($k in (Get-ChildItem -Path $root)) {',
  '    $p = (Get-ItemProperty -Path $k.PSPath)."(default)"',
  '    if ($p) {',
  '      [void]$out.Add([pscustomobject]@{',
  '        type = "app-path"; label = $k.PSChildName; target = $p.Trim(\'"\')',
  '      })',
  '    }',
  '  }',
  '}',
  '$menus = @(',
  '  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"),',
  '  (Join-Path $env:ProgramData "Microsoft\\Windows\\Start Menu\\Programs")',
  ')',
  'foreach ($m in $menus) {',
  '  if (Test-Path -LiteralPath $m) {',
  '    foreach ($f in (Get-ChildItem -LiteralPath $m -Filter "*.lnk" -Recurse)) {',
  '      [void]$out.Add([pscustomobject]@{',
  '        type = "shortcut"; label = $f.BaseName; target = $f.FullName',
  '      })',
  '    }',
  '  }',
  '}',
  'foreach ($a in (Get-StartApps)) {',
  '  [void]$out.Add([pscustomobject]@{',
  '    type = "store"; label = $a.Name; target = ("shell:AppsFolder\\" + $a.AppID)',
  '  })',
  '}',
  '@($out) | ConvertTo-Json -Compress -Depth 3',
].join('\n');

async function indexApps() {
  const rows = await runPowerShell(APPS_SCRIPT);
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    if (!r || typeof r.target !== 'string' || !r.target) continue;
    const key = r.target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      label: String(r.label || r.target),
      target: r.target,
      type: String(r.type || 'unknown'),
    });
  }
  const byType = {};
  for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
  return { items, meta: { byType } };
}

// ---------------------------------------------------------------------------
// 2. פרוטוקולים רשומים - אילו כתובות מסוג 'whatsapp:' באמת פותחות משהו
// ---------------------------------------------------------------------------
// Get-ChildItem + Get-ItemProperty על כל HKEY_CLASSES_ROOT הוא עשרות אלפי
// קריאות רישום, והוא לא הסתיים אפילו בתשעים שניות. ה-API של .NET פותח
// מפתח ובודק רק את שמות הערכים שבו בלי לממש אותם - חמש שניות במקום לעולם.
// סינון מפתחות שמתחילים בנקודה מוריד מראש את סיומות הקבצים, שהן הרוב.
const PROTOCOLS_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$root = [Microsoft.Win32.Registry]::ClassesRoot',
  '$out = New-Object System.Collections.ArrayList',
  'foreach ($name in $root.GetSubKeyNames()) {',
  '  if ($name.StartsWith(".")) { continue }',
  '  $k = $root.OpenSubKey($name)',
  '  if ($null -eq $k) { continue }',
  '  if ($k.GetValueNames() -contains "URL Protocol") {',
  '    [void]$out.Add([pscustomobject]@{ scheme = $name; label = [string]$k.GetValue("") })',
  '  }',
  '  $k.Close()',
  '}',
  '@($out) | ConvertTo-Json -Compress -Depth 3',
].join('\n');

async function indexProtocols() {
  const rows = await runPowerShell(PROTOCOLS_SCRIPT);
  const items = [];
  for (const r of rows) {
    if (!r || typeof r.scheme !== 'string' || !r.scheme) continue;
    items.push({ scheme: r.scheme, label: String(r.label || r.scheme) });
  }
  items.sort((a, b) => a.scheme.localeCompare(b.scheme));
  return { items, meta: {} };
}

// ---------------------------------------------------------------------------
// 3. תיקיות המשתמש - כמה יש בכל אחת ומתי נגעו בה
// ---------------------------------------------------------------------------
async function indexFolders() {
  const home = os.homedir();
  const roots = new Set([home]);
  for (const v of ['USERPROFILE', 'OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']) {
    if (process.env[v]) roots.add(process.env[v]);
  }

  const items = [];
  const seen = new Set();
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue;
      const full = path.join(root, e.name);
      const key = full.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let files = 0, dirs = 0, mtime = null;
      try {
        for (const c of fs.readdirSync(full, { withFileTypes: true })) {
          if (c.isDirectory()) dirs++; else files++;
        }
        mtime = fs.statSync(full).mtime.toISOString();
      } catch (err) {
        // תיקייה שאין אליה גישה נרשמת בכל זאת, כי עצם קיומה הוא מידע.
        items.push({ name: e.name, path: full, files: 0, dirs: 0, mtime: null, readable: false });
        continue;
      }
      items.push({ name: e.name, path: full, files, dirs, mtime, readable: true });
    }
  }
  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, meta: { roots: [...roots] } };
}

// ---------------------------------------------------------------------------
// 4. כוננים - כמה מקום נשאר, לפני שמורידים משהו גדול
// ---------------------------------------------------------------------------
const DRIVES_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '@(Get-PSDrive -PSProvider FileSystem | ForEach-Object {',
  '  [pscustomobject]@{',
  '    name = $_.Name',
  '    root = $_.Root',
  '    usedBytes = [int64]$_.Used',
  '    freeBytes = [int64]$_.Free',
  '  }',
  '}) | ConvertTo-Json -Compress -Depth 3',
].join('\n');

async function indexDrives() {
  const rows = await runPowerShell(DRIVES_SCRIPT);
  const items = [];
  for (const r of rows) {
    if (!r || !r.name) continue;
    const used = Number(r.usedBytes) || 0;
    const free = Number(r.freeBytes) || 0;
    items.push({
      name: String(r.name),
      root: String(r.root || ''),
      usedBytes: used,
      freeBytes: free,
      totalBytes: used + free,
    });
  }
  return { items, meta: {} };
}

// ---------------------------------------------------------------------------

const JOBS = {
  apps: {
    label: 'תוכנות מותקנות',
    description: 'איפה כל תוכנה נמצאת ואיך פותחים אותה. מאיץ את open_app ומאפשר לו לעבוד גם בלי סריקה חיה.',
    run: indexApps,
  },
  protocols: {
    label: 'פרוטוקולים רשומים',
    description: 'אילו כתובות מסוג whatsapp: או spotify: באמת רשומות במחשב.',
    run: indexProtocols,
  },
  folders: {
    label: 'תיקיות המשתמש',
    description: 'התיקיות בבית ובשולחן העבודה, כמה פריטים בכל אחת ומתי נגעו בה.',
    run: indexFolders,
  },
  drives: {
    label: 'כוננים ומקום פנוי',
    description: 'הכוננים במחשב וכמה מקום נשאר בכל אחד.',
    run: indexDrives,
  },
};

function listJobs() {
  return Object.entries(JOBS).map(([name, j]) => ({
    name,
    label: j.label,
    description: j.description,
  }));
}

async function runJob(name) {
  const job = JOBS[name];
  if (!job) {
    const err = new Error(`אין משימת איסוף בשם '${name}'.`);
    err.status = 404;
    throw err;
  }
  const started = Date.now();
  const result = await job.run();
  return {
    items: result.items,
    meta: { ...(result.meta || {}), label: job.label, durationMs: Date.now() - started },
  };
}

module.exports = { listJobs, runJob, JOBS };
