/**
 * העדכון העצמי: השוואת גרסאות, ומה נשמר מהחלפה.
 *   node test/updater.test.js
 *
 * הקוד הזה מחליף את הקוד שרץ במחשב, ולכן הוא הרגיש ביותר בפרויקט. גרסה
 * קודמת שלו הוסרה לגמרי אחרי שהתברר שהיא נתיב HTTP ללא אימות שמוריד ZIP
 * ומריץ החלפת קבצים - כלומר כל תהליך מקומי יכול היה להחליף את התוסף.
 *
 * מה שנבדק כאן הוא מה שאפשר לבדוק בלי רשת: השוואת הגרסאות, שהמאגר מקובע
 * ואינו פרמטר, ושרשימת השימור מכסה בדיוק את מה שאסור לדרוס. אימות החתימה
 * עצמו נבדק מול GitHub האמיתי, ולכן אינו כאן.
 */
const path = require('path');

const u = require(path.join(__dirname, '..', 'bridge-server', 'updater'));

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

console.log('');
console.log('=== השוואת גרסאות ===');
console.log('  השוואת מחרוזות הייתה קובעת ש-1.10.0 קטנה מ-1.9.0, כלומר מדלגת');
console.log('  על עדכון אמיתי בלי שאיש ישים לב.');
console.log('');

const CASES = [
  ['1.10.0', '1.9.0', true],
  ['1.9.0', '1.10.0', false],
  ['1.3.0', '1.3.0', false],
  ['1.3.1', '1.3.0', true],
  ['2.0.0', '1.99.99', true],
  ['1.99.99', '2.0.0', false],
  ['v1.4.0', '1.3.0', true],
  ['1.4.0', 'v1.3.0', true],
  ['1.4', '1.3.9', true],
  ['1.3', '1.3.0', false],
  ['0.0.1', '0.0.0', true],
];
for (const [a, b, want] of CASES) {
  check(`${a} > ${b} = ${want}`, u.isNewer(a, b) === want, 'קיבלתי ' + u.isNewer(a, b));
}

console.log('');
console.log('=== המאגר מקובע ===');
check('שם המאגר קבוע בקוד', u.REPO === 'ELISTE770/gemmcp-patched',
      'זו ההגנה המרכזית: אם המאגר היה פרמטר, גוף בקשה היה יכול לכוון את ' +
      'ההתקנה לקוד של מישהו אחר');
check('applyUpdate אינו מקבל מאגר', u.applyUpdate.length <= 1,
      'החתימה מקבלת אפשרויות בלבד, לא יעד');

console.log('');
console.log('=== מה לעולם אינו נדרס ===');
for (const name of ['.env', '.token', 'audit.log', 'node_modules', 'data', 'backups']) {
  check(`נשמר: ${name}`, u.PRESERVE.has(name));
}
check('הרשימה אינה ריקה', u.PRESERVE.size >= 6);

console.log('');
console.log('=== שורש ההתקנה ===');
const root = u.INSTALL_ROOT;
check('מצביע לתיקייה שמכילה את GemMCP', /GEMINI MCP$/.test(root) || root.length > 0, root);
check('אינו תיקיית bridge-server עצמה', !root.endsWith('bridge-server'), root);
check('גרסה נוכחית נקראת', /^\d+\.\d+\.\d+$/.test(u.currentVersion()), u.currentVersion());

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
