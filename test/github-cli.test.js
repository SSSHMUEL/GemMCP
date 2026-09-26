/**
 * מסלול GitHub המקומי: מה מותר להריץ, ומה נחשב פעולה שמשנה.
 *   node test/github-cli.test.js
 *
 * הפעולה הזו מריצה תהליך חיצוני עם ההרשאות המלאות של המשתמש ב-GitHub -
 * כולל מחיקת מאגרים. שתי ההגנות היחידות הן רשימת הפקודות והעובדה
 * שהארגומנטים עוברים כמערך ל-execFile ולא דרך shell. הבדיקות כאן מקבעות
 * את הראשונה; השנייה היא תכונה של execFile ואינה ניתנת לעקיפה מכאן.
 *
 * החור המסוכן ביותר הוא `gh api`: הוא מגיע לכל נקודת קצה ב-API, ובלי הגבלה
 * ל-GET הוא היה מוחק מאגר בעקיפה מלאה של הרשימה שמעליו.
 */
const path = require('path');

const gh = require(path.join(__dirname, '..', 'bridge-server', 'github-cli'));

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

function refused(args) {
  try { gh.validate(args); return null; } catch (e) { return e; }
}

console.log('');
console.log('=== רשימת הפקודות ===');

const ALLOWED = [
  ['auth', 'status'], ['repo', 'list'], ['repo', 'view', 'o/n'], ['repo', 'delete', 'o/n'],
  ['pr', 'list'], ['pr', 'merge', '1'], ['issue', 'create'], ['release', 'list'],
  ['run', 'list'], ['workflow', 'list'], ['gist', 'list'], ['label', 'list'],
  ['search', 'repos', 'x'], ['api', 'user'],
];
for (const a of ALLOWED) {
  check('מותר: gh ' + a.join(' '), refused(a) === null);
}

const BLOCKED = [
  ['config', 'set', 'x', 'y'],
  ['alias', 'set', 'boom', '!rm -rf /'],
  ['extension', 'install', 'evil/repo'],
  ['codespace', 'ssh'],
  ['completion'],
];
for (const a of BLOCKED) {
  const e = refused(a);
  check('חסום: gh ' + a.join(' '), e !== null && e.status === 403, e ? '' : 'עבר');
}

console.log('');
console.log('=== gh api הוא הפתח האחורי, ולכן מוגבל ל-GET ===');

check('api GET מותר', refused(['api', 'repos/o/n']) === null);
check('api עם --method GET מותר', refused(['api', 'repos/o/n', '--method', 'GET']) === null);

for (const variant of [
  ['api', 'repos/o/n', '-X', 'DELETE'],
  ['api', 'repos/o/n', '--method', 'DELETE'],
  ['api', 'repos/o/n', '--method=DELETE'],
  ['api', '-X', 'POST', 'repos/o/n/issues'],
  ['api', 'repos/o/n', '-X', 'patch'],
]) {
  const e = refused(variant);
  check('חסום: ' + variant.join(' '), e !== null && e.status === 403, e ? '' : 'עבר!');
}

console.log('');
console.log('=== קלט פגום ===');

check('מערך ריק נדחה', refused([]) !== null);
check('לא-מערך נדחה', refused('repo list') !== null);
check('תו בקרה נדחה', refused(['repo', 'list\nrm']) !== null);
check('בית אפס נדחה', refused(['repo', 'list' + String.fromCharCode(0)]) !== null);
check('ארגומנט ארוך מדי נדחה', refused(['repo', 'x'.repeat(600)]) !== null);
check('יותר מדי ארגומנטים נדחה', refused(new Array(50).fill('repo')) !== null);

// תווים שהיו מסוכנים ב-shell אינם מסוכנים כאן, כי אין shell. הם ארגומנט
// אחד, ו-gh פשוט ידחה אותו כשם מאגר לא תקין.
check('& בשם מאגר אינו מפיל את הבדיקה', refused(['repo', 'view', 'a&b']) === null,
      'execFile מעביר מערך; אין פירוש shell, ולכן אין מה לחסום כאן');

console.log('');
console.log('=== סיווג: מה משנה מצב ===');

const READ = [['repo', 'list'], ['pr', 'view', '1'], ['release', 'list'], ['api', 'user'],
              ['status'], ['search', 'repos', 'x'], ['run', 'view', '1']];
for (const a of READ) check('קריאה: gh ' + a.join(' '), gh.isReadOnly(a) === true);

const WRITE = [['repo', 'delete', 'o/n'], ['pr', 'merge', '1'], ['issue', 'create'],
               ['release', 'delete', 'v1'], ['repo', 'create', 'x'], ['workflow', 'run', 'x']];
for (const a of WRITE) check('משנה: gh ' + a.join(' '), gh.isReadOnly(a) === false);

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
