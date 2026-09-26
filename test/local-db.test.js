/**
 * המסד המקומי: שמות אוספים, עמידות בפני קובץ פגום, ודירוג חיפוש.
 *   node test/local-db.test.js
 *
 * הדבר המסוכן כאן הוא שם האוסף: הוא מגיע מגוף בקשת HTTP ומרכיב נתיב קובץ.
 * בלי אכיפה, '../../server' הוא שם אוסף תקף לחלוטין מבחינת הקוד - וכתיבה
 * אליו דורסת את השרת עצמו.
 */
const fs = require('fs');
const path = require('path');

const db = require(path.join(__dirname, '..', 'bridge-server', 'local-db'));

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

function threw(fn) {
  try { fn(); return false; } catch (e) { return true; }
}

// אוסף ייעודי לבדיקה, שנמחק בסוף. שם אמיתי היה נמחק יחד איתו.
const T = 'testcol';

console.log('');
console.log('=== שם אוסף מרכיב נתיב קובץ, ולכן נאכף ===');

const BAD = ['../../server', '../secret', 'a/b', 'UPPER', '', '.', '..', 'x'.repeat(60), 'has space', '1leading'];
for (const name of BAD) {
  check(`נדחה: ${JSON.stringify(name)}`, threw(() => db.readCollection(name)));
}

const GOOD = ['apps', 'my-col', 'a_b', 'x2'];
for (const name of GOOD) {
  check(`מתקבל: ${name}`, !threw(() => db.readCollection(name)));
}

console.log('');
console.log('=== אוסף שלא קיים הוא ריק, לא שגיאה ===');
const missing = db.readCollection('nosuchcollection');
check('מחזיר מבנה תקין', missing && Array.isArray(missing.items));
check('ריק', missing.count === 0);
check('בלי חותמת זמן', missing.updatedAt === null);

console.log('');
console.log('=== כתיבה וקריאה ===');
const items = [
  { label: 'chrome.exe', target: 'C:\\chrome.exe', type: 'app-path' },
  { label: 'Google Chrome', target: 'C:\\chrome.lnk', type: 'shortcut' },
  { label: 'My Chrome Helper', target: 'C:\\helper.exe', type: 'app-path' },
  { label: 'Notepad', target: 'C:\\notepad.exe', type: 'app-path' },
];
const saved = db.writeCollection(T, items, { note: 'בדיקה' });
check('מדווח על מספר הרשומות', saved.count === 4);
check('מדווח על חותמת זמן', typeof saved.updatedAt === 'string' && saved.updatedAt.length > 0);

const back = db.readCollection(T);
check('הכל חזר', back.count === 4);
check('התוכן זהה', back.items[0].target === 'C:\\chrome.exe');
check('המטא-דאטה נשמרה', back.meta && back.meta.note === 'בדיקה');

console.log('');
console.log('=== דירוג חיפוש: מדויק, ואז התחלה, ואז הכלה ===');

// 'chrome' אינו שם מדויק של אף רשומה, ולכן הדירוג כאן הוא בין התחלה להכלה:
// 'chrome.exe' מתחיל במילה, ושני האחרים רק מכילים אותה.
const q = db.queryCollection(T, { q: 'chrome' });
check('מצא שלוש התאמות', q.matched === 3, 'matched=' + q.matched);
check('המתחיל במילה קודם למכילים אותה', q.items[0] && q.items[0].label === 'chrome.exe',
      'קיבלתי ' + (q.items[0] && q.items[0].label));
check('המכילים אחריו', q.items.slice(1).every((i) => i.label !== 'chrome.exe'),
      'קיבלתי ' + q.items.map((i) => i.label).join(', '));

// התאמה מדויקת גוברת על שתיהן.
const exact = db.queryCollection(T, { q: 'notepad' });
check('התאמה מדויקת נמצאת', exact.matched >= 1);
check('ההתאמה המדויקת ראשונה', exact.items[0] && exact.items[0].label === 'Notepad',
      'קיבלתי ' + (exact.items[0] && exact.items[0].label));

const limited = db.queryCollection(T, { q: 'chrome', limit: 1 });
check('limit נאכף', limited.items.length === 1);

const byField = db.queryCollection(T, { q: 'helper', fields: ['label'] });
check('חיפוש מוגבל לשדה אחד', byField.matched === 1, 'matched=' + byField.matched);

const empty = db.queryCollection(T, { q: '' });
check('חיפוש ריק מחזיר הכל', empty.items.length === 4);

console.log('');
console.log('=== קובץ פגום לא מוחק את עצמו בשקט ===');
const corruptName = 'corrupttest';
db.writeCollection(corruptName, [{ a: 1 }], {});
fs.writeFileSync(path.join(db.DATA_DIR, corruptName + '.json'), '{ this is not json', 'utf8');
const corrupt = db.readCollection(corruptName);
check('מחזיר ריק במקום לזרוק', corrupt.count === 0);
check('מסמן שהקובץ פגום', corrupt.meta && corrupt.meta.corrupt === true);
db.deleteCollection(corruptName);

console.log('');
console.log('=== רשימת האוספים ===');
const list = db.listCollections();
check('כולל את האוסף שנכתב', list.some((c) => c.name === T));
check('מדווח על גודל בבתים', list.every((c) => typeof c.bytes === 'number'));

check('מחיקה מצליחה', db.deleteCollection(T) === true);
check('אחרי מחיקה הוא ריק', db.readCollection(T).count === 0);
check('מחיקה של מה שאין מחזירה false', db.deleteCollection('nosuchcollection') === false);

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
