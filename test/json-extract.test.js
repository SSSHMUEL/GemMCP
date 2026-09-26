/**
 * extractFirstJsonObject חייב למצוא את הפקודה גם כשיש פרוזה סביבה.
 *   node test/json-extract.test.js
 *
 * למה זה קיים: הפרסר סרק את כל טקסט התשובה, לא רק את בלוק הקוד, ושני דברים
 * שג'מיני כותב כל הזמן הרסו אותו לצמיתות באמצע הטקסט:
 *
 *   1. מספר אי-זוגי של גרשיים בפרוזה נעל את inString על true, ומשם כל
 *      הסוגריים התעלמו.
 *   2. סוגר מסולסל תועה לפני האובייקט הוריד את המונה מתחת לאפס, ואז התנאי
 *      openBraces === 0 לא יכול היה להתקיים שוב לעולם.
 *
 * בשני המקרים הפונקציה החזירה null על הודעה שמכילה פקודה תקינה לחלוטין -
 * בלי שגיאה, בלי לוג, בלי שום סימן. זה בדיוק מה שנראה למשתמש כמו
 * "לפעמים הוא לא מזהה שיש פקודה".
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

const src = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');

// מושכים את הפונקציה מתוך ה-IIFE. אם היא נעלמה או שונתה שמה, הבדיקה חייבת
// ליפול ברעש - לא לעבור בשקט על גרסה שאינה קיימת.
const start = src.indexOf('function extractFirstJsonObject(str) {');
if (start < 0) {
  console.error('  extractFirstJsonObject לא נמצאה ב-content.js. אם שינית את שמה, עדכן כאן.');
  process.exit(1);
}
const end = src.indexOf('\n  }', start);
const fnSrc = src.slice(start, end + 4);

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fnSrc + '\nthis.extract = extractFirstJsonObject;', ctx);
const extract = ctx.extract;

const CALL = '{"action": "run_command", "command": "dir"}';

console.log('');
console.log('=== extractFirstJsonObject: פקודה מוקפת בפרוזה ===');

check('אובייקט נקי',
  JSON.stringify(extract(CALL)) === JSON.stringify({ action: 'run_command', command: 'dir' }));

// המקרה הראשון שהיה שובר: גרש אחד בודד לפני הבלוק.
check('גרש אי-זוגי בפרוזה שלפני הבלוק',
  extract('Sure, I will run the "dir command for you.\n' + CALL) !== null,
  'inString ננעל על הגרש הפותח וכל הסוגריים אחריו התעלמו');

check('שלושה גרשיים לפני הבלוק',
  extract('He said "hello" and then "goodbye\n' + CALL) !== null);

// המקרה השני: סוגר תועה לפני האובייקט.
check('סוגר מסולסל תועה לפני האובייקט',
  extract('the closing } here is stray\n' + CALL) !== null,
  'המונה ירד ל--1 ולא חזר לאפס לעולם');

check('כמה סוגרים תועים ברצף',
  extract('} } }\n' + CALL) !== null);

check('שילוב של השניים',
  extract('a stray } and an odd " quote\n' + CALL) !== null);

console.log('');
console.log('=== מה שהיה תקין קודם חייב להישאר תקין ===');

check('סוגריים בתוך מחרוזת אינם נספרים',
  JSON.stringify(extract('{"command": "echo {not a brace}"}')) ===
  JSON.stringify({ command: 'echo {not a brace}' }));

check('גרש מוברח בתוך מחרוזת',
  extract('{"command": "echo \\"hi\\""}') !== null);

check('אובייקט מקונן',
  JSON.stringify(extract('{"a": {"b": 1}}')) === JSON.stringify({ a: { b: 1 } }));

check('מדלג על מועמד לא תקין וממשיך לתקין',
  JSON.stringify(extract('{not json} then ' + CALL)) ===
  JSON.stringify({ action: 'run_command', command: 'dir' }));

check('הראשון מבין שניים הוא זה שחוזר',
  JSON.stringify(extract('{"first": 1} {"second": 2}')) === JSON.stringify({ first: 1 }));

check('טקסט בלי אובייקט מחזיר null', extract('no json here at all') === null);
check('מחרוזת ריקה מחזירה null', extract('') === null);
check('אובייקט לא סגור מחזיר null', extract('{"action": "run_command"') === null);

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
