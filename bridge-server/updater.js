'use strict';

/**
 * עדכון עצמי מ-GitHub.
 *
 * רקע חשוב: היה כאן פעם /api/update, והוא הוסר בכוונה. הוא היה נתיב ללא שום
 * אימות שהריץ git pull או הוריד ZIP והחליף את הקוד המקומי דרך PowerShell -
 * וה-CORS דאז אישר גם בקשות ללא Origin, כך שכל תהליך מקומי היה יכול לגרום
 * למחשב להוריד ולהריץ קוד חדש.
 *
 * מה שונה כאן:
 *
 *   1. המאגר מקובע בקוד. הוא אינו פרמטר, ולכן אי אפשר לכוון את העדכון למקום
 *      אחר דרך גוף הבקשה - זו הייתה החולשה המרכזית.
 *   2. הקובץ נבדק מול ה-sha256 ש-GitHub מפרסם לנכס. בלי חתימה תואמת אין
 *      התקנה, נקודה. גם הורדה שהצליחה אך אינה תואמת נזרקת.
 *   3. שום דבר מתוך הארכיון אינו מורץ. הוא נפרס ומועתק כקבצים בלבד.
 *   4. גיבוי לפני החלפה, ורשימת קבצים שלעולם אינם נדרסים: ‎.env, הטוקן,
 *      יומן הביקורת, node_modules והמסד המקומי.
 *
 * מה שאי אפשר לעשות, ואומרים את זה בפירוש: Chrome אינו מעדכן תוסף שנטען
 * כ-unpacked. אפשר להחליף את קבצי התוסף על הדיסק, אבל הטעינה מחדש היא
 * לחיצה של המשתמש ב-chrome://extensions. אין דרך לעקוף את זה.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

// מקובע. לא פרמטר, לא הגדרה, ולא משהו שגוף בקשה יכול לשנות.
const REPO = 'ELISTE770/gemmcp-patched';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const INSTALL_ROOT = path.resolve(__dirname, '..', '..');
const MAX_ZIP_BYTES = 80 * 1024 * 1024;
const NET_TIMEOUT_MS = 120000;

// שמות שלעולם אינם נדרסים על ידי עדכון. אלה הדברים ששייכים להתקנה הזו
// ולא לגרסה: הגדרות, סודות, יומן, תלויות והמסד שנאסף במחשב.
const PRESERVE = new Set([
  '.env', '.token', 'audit.log', 'node_modules', 'data', 'last_path.txt', 'backups',
]);

function currentVersion() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(INSTALL_ROOT, 'GemMCP-extension', 'manifest.json'), 'utf8'));
    return String(m.version || '0.0.0');
  } catch (e) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(INSTALL_ROOT, 'GemMCP', 'manifest.json'), 'utf8'));
      return String(m.version || '0.0.0');
    } catch (e2) {
      return '0.0.0';
    }
  }
}

/**
 * השוואת גרסאות סמנטית. השוואת מחרוזות הייתה קובעת ש-1.10.0 קטנה מ-1.9.0.
 */
function isNewer(candidate, current) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GemMCP-Bridge', Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GitHub החזיר ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * מה הגרסה האחרונה, והאם היא חדשה יותר. אינו מוריד דבר.
 */
async function checkForUpdate() {
  const current = currentVersion();
  const rel = await fetchJson(RELEASE_API);
  const latest = String(rel.tag_name || '').replace(/^v/, '');

  const asset = (rel.assets || []).find((a) => String(a.name || '').endsWith('.zip'));

  return {
    current,
    latest,
    newer: Boolean(latest) && isNewer(latest, current),
    notes: rel.body || '',
    publishedAt: rel.published_at || null,
    asset: asset
      ? { name: asset.name, size: asset.size, digest: asset.digest || null, url: asset.browser_download_url }
      : null,
  };
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
      timeout: 180000,
      killSignal: 'SIGKILL',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim()));
      resolve(String(stdout || '').trim());
    });
  });
}

/**
 * העתקה רקורסיבית שמכבדת את רשימת השימור. מחזירה את מספר הקבצים שנכתבו.
 */
function copyTree(from, to, stats) {
  const entries = fs.readdirSync(from, { withFileTypes: true });
  for (const e of entries) {
    if (PRESERVE.has(e.name)) { stats.preserved.push(e.name); continue; }
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyTree(src, dst, stats);
    } else if (e.isFile()) {
      fs.copyFileSync(src, dst);
      stats.files++;
    }
  }
  return stats;
}

function backupTree(from, to, stats) {
  if (!fs.existsSync(from)) return;
  const entries = fs.readdirSync(from, { withFileTypes: true });
  fs.mkdirSync(to, { recursive: true });
  for (const e of entries) {
    // node_modules הוא אלפי קבצים ומאה מגהבייט, והוא לא משתנה בעדכון.
    // גיבוי שלו היה הופך פעולה של שנייה לפעולה של דקות.
    if (e.name === 'node_modules') continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) backupTree(src, dst, stats);
    else if (e.isFile()) { fs.copyFileSync(src, dst); stats.files++; }
  }
}

/**
 * מוריד, מאמת, מגבה ומחליף. אינו מריץ דבר מתוך הארכיון.
 *
 * @param {object} [opts] { dryRun }
 */
async function applyUpdate(opts) {
  const dryRun = Boolean(opts && opts.dryRun);
  const info = await checkForUpdate();

  if (!info.newer) {
    return { updated: false, reason: 'already-current', ...info };
  }
  if (!info.asset) {
    throw Object.assign(new Error('לגרסה האחרונה אין קובץ ZIP מצורף.'), { status: 502 });
  }
  if (!info.asset.digest) {
    // בלי חתימה אין דרך לדעת שמה שהתקבל הוא מה שפורסם, ולכן לא מתקינים.
    throw Object.assign(
      new Error('GitHub לא פרסם חתימת sha256 לקובץ. העדכון נעצר - עדכן ידנית.'),
      { status: 502 }
    );
  }
  if (info.asset.size > MAX_ZIP_BYTES) {
    throw Object.assign(new Error(`הקובץ גדול מהצפוי (${info.asset.size} בתים).`), { status: 502 });
  }

  // הכתובת חייבת להיות של הנכס במאגר המקובע. גם אם ה-API היה מחזיר משהו
  // אחר, לא נוריד ממנו.
  const url = String(info.asset.url || '');
  if (!url.startsWith(`https://github.com/${REPO}/releases/download/`)) {
    throw Object.assign(new Error('כתובת ההורדה אינה של המאגר הרשמי.'), { status: 502 });
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gemmcp-update-'));
  const zipPath = path.join(work, 'update.zip');
  const staged = path.join(work, 'staged');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
    let buf;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
      if (!res.ok) throw new Error(`ההורדה נכשלה (${res.status})`);
      buf = Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }

    const got = 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
    if (got !== info.asset.digest) {
      throw Object.assign(
        new Error(`חתימת הקובץ אינה תואמת. צפוי ${info.asset.digest}, התקבל ${got}. העדכון בוטל.`),
        { status: 502 }
      );
    }

    fs.writeFileSync(zipPath, buf);
    fs.mkdirSync(staged, { recursive: true });
    await runPowerShell(['-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${staged.replace(/'/g, "''")}' -Force`]);

    // בדיקת שפיות על מה שנפרס. ארכיון במבנה אחר היה מפזר קבצים על ההתקנה.
    const needed = ['GemMCP', 'GemMCP-extension'];
    for (const dir of needed) {
      if (!fs.existsSync(path.join(staged, dir, 'manifest.json'))) {
        throw Object.assign(
          new Error(`הארכיון אינו במבנה הצפוי (חסר ${dir}/manifest.json). העדכון בוטל.`),
          { status: 502 }
        );
      }
    }
    const stagedVersion = JSON.parse(
      fs.readFileSync(path.join(staged, 'GemMCP-extension', 'manifest.json'), 'utf8')
    ).version;
    if (String(stagedVersion) !== info.latest) {
      throw Object.assign(
        new Error(`הגרסה בארכיון (${stagedVersion}) אינה תואמת לתגית (${info.latest}). העדכון בוטל.`),
        { status: 502 }
      );
    }

    if (dryRun) {
      return { updated: false, reason: 'dry-run', verified: true, stagedVersion, ...info };
    }

    const backupDir = path.join(INSTALL_ROOT, 'backups', `${info.current}-before-${info.latest}`);
    const backupStats = { files: 0 };
    for (const dir of needed) {
      backupTree(path.join(INSTALL_ROOT, dir), path.join(backupDir, dir), backupStats);
    }

    const stats = { files: 0, preserved: [] };
    for (const dir of needed) {
      copyTree(path.join(staged, dir), path.join(INSTALL_ROOT, dir), stats);
    }
    // קבצים בשורש הארכיון - README, GUIDE וכדומה.
    for (const e of fs.readdirSync(staged, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      fs.copyFileSync(path.join(staged, e.name), path.join(INSTALL_ROOT, e.name));
      stats.files++;
    }

    return {
      updated: true,
      from: info.current,
      to: info.latest,
      filesWritten: stats.files,
      filesBackedUp: backupStats.files,
      backupDir,
      preserved: [...new Set(stats.preserved)],
      // אי אפשר לטעון תוסף unpacked מחדש מהקוד. אומרים את זה, במקום לתת
      // למשתמש לחשוב שהעדכון הסתיים והוא עדיין מריץ את הגרסה הישנה.
      nextSteps: [
        'הפעל מחדש את שרת הגשר (סגור את החלון והרץ שוב start-bridge.bat)',
        'ב-chrome://extensions לחץ על כפתור הרענון בכרטיס של GemMCP',
      ],
    };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* זמני ממילא */ }
  }
}

module.exports = { checkForUpdate, applyUpdate, isNewer, currentVersion, REPO, INSTALL_ROOT, PRESERVE };
