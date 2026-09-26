'use strict';

/**
 * איתור תוכנה שאינה נמצאת ב-PATH.
 *
 * הבדיקה היחידה שהייתה קודם היא where.exe, כלומר PATH בלבד. רוב התוכנות
 * במחשב Windows אינן שם: כרום, וורד, ספוטיפיי ואפליקציות Store לא מוסיפות
 * את עצמן ל-PATH. התוצאה הייתה 404 יבש - "לא נמצא במחשב" - על תוכנה שמותקנת
 * ורצה מצוין מתפריט התחל.
 *
 * כאן נסרקים שלושת המקומות שבהם Windows באמת רושם תוכנות:
 *   App Paths ברישום - איך שהדפדפנים ו-Office רושמים את עצמם
 *   קיצורי .lnk בתפריט התחל - איך שכמעט כל מתקין רושם את עצמו
 *   Get-StartApps - אפליקציות Store/UWP, שאין להן קובץ הרצה נגיש בכלל
 *
 * אבטחה: שם התוכנה מגיע בסופו של דבר מפלט של מודל. הוא מועבר לסקריפט דרך
 * משתנה סביבה ולעולם לא נשתל בתוך קוד ה-PowerShell עצמו - זו אותה הפרדה
 * שנדרשה אחרי תקלת ההזרקה ב-manage_windows. הערך משמש שם רק כתבנית -like,
 * ותבנית עם תווים כלליים יכולה להרחיב את החיפוש אך לא להריץ דבר.
 */

const { execFile } = require('child_process');
const localDb = require('./local-db');

const RESOLVE_TIMEOUT_MS = 12000;
const MAX_CANDIDATES = 12;

// הסקריפט קבוע לחלוטין. הקלט נכנס אליו רק דרך $env:GEMMCP_TARGET.
const RESOLVER = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$name = $env:GEMMCP_TARGET',
  'if (-not $name -or $name.Length -lt 2) { "[]"; exit }',
  // -like מפרש *, ? ו-[ כתווים כלליים. שם שמכיל אותם - למשל שם שנפגם
  // בקידוד והפך ל-"???????" - הופך לתבנית שמתאימה לכל דבר, והחיפוש מחזיר
  // רשימת תוכנות אקראיות במקום להודות שלא מצא. Escape הופך אותם לתווים
  // רגילים, ומשם התבנית מתארת את מה שהמשתמש באמת כתב.
  '$safe = [System.Management.Automation.WildcardPattern]::Escape($name)',
  '$pattern = "*" + $safe + "*"',
  '$out = New-Object System.Collections.ArrayList',
  '',
  '# 1. App Paths - כאן נרשמים דפדפנים, Office ורוב התוכנות השולחניות',
  '$roots = @(',
  '  "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",',
  '  "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths"',
  ')',
  'foreach ($root in $roots) {',
  '  foreach ($k in (Get-ChildItem -Path $root)) {',
  '    if ($k.PSChildName -like $pattern) {',
  '      $p = (Get-ItemProperty -Path $k.PSPath)."(default)"',
  '      if ($p) {',
  '        [void]$out.Add([pscustomobject]@{',
  '          type = "app-path"; label = $k.PSChildName; target = $p.Trim(\'"\')',
  '        })',
  '      }',
  '    }',
  '  }',
  '}',
  '',
  '# 2. קיצורי תפריט התחל, של המשתמש ושל כל המחשב',
  '$menus = @(',
  '  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"),',
  '  (Join-Path $env:ProgramData "Microsoft\\Windows\\Start Menu\\Programs")',
  ')',
  'foreach ($m in $menus) {',
  '  if (Test-Path -LiteralPath $m) {',
  '    foreach ($f in (Get-ChildItem -LiteralPath $m -Filter "*.lnk" -Recurse)) {',
  '      if ($f.BaseName -like $pattern) {',
  '        [void]$out.Add([pscustomobject]@{',
  '          type = "shortcut"; label = $f.BaseName; target = $f.FullName',
  '        })',
  '      }',
  '    }',
  '  }',
  '}',
  '',
  '# 3. אפליקציות Store/UWP - אין להן exe שאפשר להריץ, רק AppID',
  'foreach ($a in (Get-StartApps)) {',
  '  if ($a.Name -like $pattern) {',
  '    [void]$out.Add([pscustomobject]@{',
  '      type = "store"; label = $a.Name; target = ("shell:AppsFolder\\" + $a.AppID)',
  '    })',
  '  }',
  '}',
  '',
  '# ConvertTo-Json על איבר בודד מחזיר אובייקט ולא מערך, ולכן העטיפה.',
  '@($out | Select-Object -First ' + MAX_CANDIDATES + ') | ConvertTo-Json -Compress -Depth 3',
].join('\n');

/**
 * מחזיר מועמדים לפתיחה עבור שם תוכנה. לעולם אינו זורק: כשלון איתור אינו
 * שגיאה אלא פשוט רשימה ריקה.
 *
 * @param {string} name שם התוכנה כפי שהמשתמש כתב אותו
 * @returns {Promise<Array<{type: string, label: string, target: string}>>}
 */
/**
 * אותה שאלה, מתוך האוסף שנאסף מראש. מחזיר null כשאין אוסף בכלל, כדי
 * להבדיל בין "לא נסרק מעולם" לבין "נסרק ולא נמצא".
 */
function fromIndex(target) {
  let col;
  try { col = localDb.readCollection('apps'); } catch (e) { return null; }
  if (!col || !col.items.length) return null;

  const q = target.toLowerCase();
  const seen = new Set();
  const out = [];
  for (const i of col.items) {
    const label = String((i && i.label) || '');
    if (!label.toLowerCase().includes(q)) continue;
    const t = String((i && i.target) || '');
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push({ type: String(i.type || 'unknown'), label, target: t });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

function resolveAppCandidates(name) {
  return new Promise((resolve) => {
    const target = String(name || '').trim();
    if (!target) return resolve([]);

    // האוסף המקומי קודם. הסריקה החיה עולה שמונה עד עשר שניות, והתשובה
    // ממנו זהה. אוסף שקיים אך לא החזיר כלום אינו סוף פסוק - ייתכן שהתוכנה
    // הותקנה אחרי האיסוף - ולכן במקרה הזה עדיין סורקים בפועל.
    const indexed = fromIndex(target);
    if (indexed && indexed.length) return resolve(indexed);

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', RESOLVER],
      {
        timeout: RESOLVE_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        // stdio חייב להיות תקין: בהרצה מנותקת execFile נכשל בלעדיו.
        env: { ...process.env, GEMMCP_TARGET: target },
      },
      (err, stdout) => {
        if (err) return resolve([]);
        let parsed;
        try {
          parsed = JSON.parse(String(stdout || '').trim() || '[]');
        } catch (e) {
          return resolve([]);
        }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const seen = new Set();
        const out = [];
        for (const c of list) {
          if (!c || typeof c.target !== 'string' || !c.target) continue;
          const key = c.target.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            type: String(c.type || 'unknown'),
            label: String(c.label || c.target),
            target: c.target,
          });
        }
        resolve(out.slice(0, MAX_CANDIDATES));
      }
    );
  });
}

module.exports = { resolveAppCandidates, MAX_CANDIDATES };
