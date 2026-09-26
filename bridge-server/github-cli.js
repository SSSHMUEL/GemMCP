'use strict';

/**
 * מסלול GitHub מקומי, דרך ה-CLI הרשמי שכבר מאומת במחשב.
 *
 * למה זה קיים: מסלול ה-OAuth של התוסף מחזיק טוקן משלו, עם ההרשאות שהמשתמש
 * נתן לו פעם. אבל ברוב המחשבים gh כבר מחובר - עם החשבון האמיתי ועם ההרשאות
 * המלאות - ואז אין סיבה לבקש טוקן שני ולנהל אותו. פעולות שהטוקן של התוסף
 * אינו מורשה לבצע, כמו מחיקת מאגר, פשוט עובדות כאן.
 *
 * אבטחה, ובמפורש:
 *
 *   1. הארגומנטים מועברים כמערך ל-execFile. אין shell, ולכן אין פירוש של
 *      & | ; ` או כל תו אחר. זו אותה מסקנה שנלמדה מתקלת ההזרקה ב-manage_windows.
 *   2. רשימת פקודות סגורה. מה שאינו ברשימה נדחה, ולא להפך.
 *   3. `gh api` מוגבל ל-GET. בלי ההגבלה הזו הוא היה פתח אחורי לכל פעולה
 *      ב-API כולו - כולל מחיקה - שעוקף את כל הרשימה שמעליו.
 *   4. הפרדה בין פקודות קריאה לפקודות שמשנות. הראשונות רצות; השניות מסומנות
 *      ככאלה שדורשות אישור, והתוסף עוצר עליהן גם במצב אוטונומי.
 */

const { execFile } = require('child_process');

const GH_TIMEOUT_MS = 60000;
const MAX_ARGS = 40;
const MAX_ARG_LEN = 500;

// פקודות ראשיות מותרות. כל מה שאינו כאן נדחה.
const ALLOWED_COMMANDS = new Set([
  'auth', 'repo', 'pr', 'issue', 'release', 'run', 'workflow',
  'gist', 'label', 'api', 'search', 'browse', 'status', 'org', 'ruleset',
]);

// תת-פקודות שאינן משנות דבר. הן מסווגות כבטוחות; כל השאר דורש אישור.
const READ_ONLY_SUBCOMMANDS = new Set([
  'list', 'view', 'status', 'diff', 'checks', 'search', 'download', 'ls',
]);

// פקודות שאין להן תת-פקודה ובכל זאת הן קריאה בלבד.
const READ_ONLY_COMMANDS = new Set(['status', 'search', 'browse']);

/**
 * האם קריאה זו משנה משהו? משמש את התוסף כדי להחליט אם לעצור לאישור.
 */
function isReadOnly(args) {
  const cmd = String(args[0] || '').toLowerCase();
  const sub = String(args[1] || '').toLowerCase();

  if (cmd === 'api') {
    // ברירת המחדל של gh api היא GET, ולכן היעדר --method היא קריאה.
    const m = methodOf(args);
    return m === 'GET' || m === 'HEAD';
  }
  if (READ_ONLY_COMMANDS.has(cmd)) return true;
  return READ_ONLY_SUBCOMMANDS.has(sub);
}

function methodOf(args) {
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '-X' || a === '--method') return String(args[i + 1] || '').toUpperCase();
    if (a.startsWith('--method=')) return a.slice(9).toUpperCase();
  }
  return 'GET';
}

/**
 * בדיקת הבקשה מול הרשימות. זורק עם status כשהיא נדחית.
 */
function validate(rawArgs) {
  if (!Array.isArray(rawArgs) || !rawArgs.length) {
    const e = new Error('חסרים ארגומנטים ל-gh. לדוגמה: ["repo", "list"]');
    e.status = 400;
    throw e;
  }
  if (rawArgs.length > MAX_ARGS) {
    const e = new Error(`יותר מדי ארגומנטים (${rawArgs.length}).`);
    e.status = 400;
    throw e;
  }

  const args = [];
  for (const raw of rawArgs) {
    const a = String(raw === undefined || raw === null ? '' : raw);
    if (a.length > MAX_ARG_LEN) {
      const e = new Error('ארגומנט ארוך מדי.');
      e.status = 400;
      throw e;
    }
    // execFile אינו פותח shell, ולכן תווים מיוחדים אינם מסוכנים כאן. מה שכן
    // מסוכן הוא בית אפס ומעברי שורה, שמבלבלים כלים במורד הזרם.
    for (const ch of a) {
      if (ch.charCodeAt(0) < 32) {
        const e = new Error('ארגומנט מכיל תו בקרה.');
        e.status = 400;
        throw e;
      }
    }
    args.push(a);
  }

  const cmd = args[0].toLowerCase();
  if (!ALLOWED_COMMANDS.has(cmd)) {
    const e = new Error(
      `פקודת gh '${args[0]}' אינה ברשימה המותרת. מותרות: ${[...ALLOWED_COMMANDS].sort().join(', ')}.`
    );
    e.status = 403;
    throw e;
  }

  if (cmd === 'api') {
    const method = methodOf(args);
    if (method !== 'GET' && method !== 'HEAD') {
      const e = new Error(
        `'gh api' מוגבל ל-GET. בקשת ${method} דרך api עוקפת את רשימת הפקודות כולה, ` +
        'ולכן היא חסומה. השתמש בפקודה הייעודית במקום.'
      );
      e.status = 403;
      throw e;
    }
  }

  return args;
}

/**
 * מריץ gh ומחזיר את הפלט.
 *
 * @param {string[]} rawArgs ארגומנטים, כמערך
 * @param {string} [cwd] תיקיית עבודה, לפקודות שתלויות במאגר מקומי
 */
function runGh(rawArgs, cwd) {
  const args = validate(rawArgs);

  return new Promise((resolve, reject) => {
    execFile('gh', args, {
      timeout: GH_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      cwd: cwd || undefined,
      // gh משתמש ב-keyring של Windows, ולכן הוא חייב את סביבת המשתמש.
      env: process.env,
    }, (err, stdout, stderr) => {
      const out = String(stdout || '').trim();
      const errText = String(stderr || '').trim();

      if (err) {
        if (err.code === 'ENOENT') {
          const e = new Error(
            'GitHub CLI אינו מותקן במחשב. התקן מ-https://cli.github.com ואז הרץ: gh auth login'
          );
          e.status = 404;
          return reject(e);
        }
        if (err.killed) {
          const e = new Error('הפקודה לא הסתיימה בזמן ובוטלה.');
          e.status = 504;
          return reject(e);
        }
        // gh מדפיס שגיאות ברורות ל-stderr; הן שימושיות בהרבה מקוד היציאה.
        const e = new Error(errText || err.message);
        e.status = 400;
        return reject(e);
      }

      resolve({
        command: 'gh ' + args.join(' '),
        readOnly: isReadOnly(args),
        output: out,
        stderr: errText || null,
      });
    });
  });
}

module.exports = { runGh, validate, isReadOnly, ALLOWED_COMMANDS, READ_ONLY_SUBCOMMANDS };
