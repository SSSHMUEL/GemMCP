/**
 * כל מפתח data-i18n ב-HTML חייב להתקיים בשתי השפות.
 *   node test/i18n-coverage.test.js
 *
 * למה זה קיים: הוספתי שדות חדשים לפופאפ עם data-i18n, ולא הוספתי את
 * הערכים ל-i18n.js. הפונקציה t() מחזירה את המפתח עצמו כשהוא חסר, ולכן
 * המשתמש ראה במסך "winPermInstallTitle" במקום "הורדה והתקנה מהאינטרנט" -
 * והסיק שההגדרה לא קיימת.
 *
 * שום בדיקה קודמת לא תפסה את זה: הקובץ תקין תחבירית, הבדיקות עוברות,
 * וה-HTML נטען. רק עין אנושית על הפופאפ גילתה.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// כל מפתח שה-HTML מבקש
const keys = [...new Set(
  [...html.matchAll(/data-i18n(?:-title)?="([A-Za-z0-9_]+)"/g)].map((m) => m[1])
)].sort();

const ctx = { window: {}, navigator: { language: 'he' }, console: { log() {}, warn() {} } };
vm.createContext(ctx);
vm.runInContext(i18nSrc, ctx);
const t = ctx.t || (ctx.window && ctx.window.t);

console.log('');
console.log('=== every data-i18n key resolves, in both languages ===');
console.log('  keys used by the popup: ' + keys.length);

if (typeof t !== 'function') {
  console.error('  לא נמצאה הפונקציה t ב-i18n.js.');
  process.exit(1);
}

for (const lang of ['he', 'en']) {
  const missing = keys.filter((k) => {
    const v = t(k, lang);
    // t מחזירה את המפתח עצמו כשאין תרגום. זה בדיוק מה שהמשתמש ראה על המסך.
    return !v || v === k;
  });
  check(`${lang}: all ${keys.length} keys have a value`,
        missing.length === 0,
        missing.length ? 'missing: ' + missing.join(', ') : '');
}

console.log('');
console.log('================================================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('');
  failures.forEach((f) => console.log('   - ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
}
console.log('================================================');
console.log('');
process.exit(fail ? 1 : 0);
