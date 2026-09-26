/**
 * עריכת ההגדרות: אימות ערכים, ושמירה שאינה הורסת את קובץ ה-.env.
 *   node test/settings.test.js
 *
 * הסיכון כאן אינו תיאורטי: הקוד הזה כותב לקובץ התצורה של ההתקנה. קובץ .env
 * שנכתב מחדש מתוך הסכימה בלבד היה מוחק את ההערות שמסבירות כל הגדרה, ובעיקר
 * את המפתחות שאינם בסכימה - מפתחות OAuth וחיבורי Supabase. הבדיקות כאן
 * רצות מול קובץ זמני, לא מול ה-.env האמיתי.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

// מריצים מול עותק זמני של המודול, כדי שהוא יכתוב לקובץ שלנו ולא ל-.env
// האמיתי של ההתקנה.
const SRC = path.join(__dirname, '..', 'bridge-server', 'settings.js');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gemmcp-settings-'));
const TMP_MODULE = path.join(TMP_DIR, 'settings.js');
fs.writeFileSync(TMP_MODULE, fs.readFileSync(SRC, 'utf8'), 'utf8');

const ENV = path.join(TMP_DIR, '.env');
const ORIGINAL_ENV = [
  '# GemMCP Bridge Server Configuration',
  'PORT=3000',
  '',
  '# הרשאות Windows - תקרה, לא ברירת מחדל.',
  'WIN_PERM_READ=true',
  'WIN_PERM_WRITE=false',
  '',
  '# הורדה והרצה של קובץ מהאינטרנט.',
  '# WIN_PERM_INSTALL=false',
  '',
  '# OAuth App Credentials - לא בסכימה, וחייב לשרוד כל שמירה',
  'GITHUB_CLIENT_SECRET=super-secret-value',
  'NOTION_CLIENT_ID=abc123',
  '',
].join('\n');
fs.writeFileSync(ENV, ORIGINAL_ENV, 'utf8');

const settings = require(TMP_MODULE);

console.log('');
console.log('=== אימות ערכים ===');

check('בוליאני דוחה מחרוזת', threw(() => settings.validate('WIN_PERM_READ', 'true')) !== null);
check('בוליאני מקבל true', settings.validate('WIN_PERM_READ', true) === 'true');
check('בוליאני מקבל false', settings.validate('WIN_PERM_READ', false) === 'false');

check('מפתח שאינו בסכימה נדחה', threw(() => settings.validate('SOME_OTHER_KEY', 'x')) !== null);
check('מפתח OAuth אינו ניתן לעריכה', threw(() => settings.validate('GITHUB_CLIENT_SECRET', 'x')) !== null,
      'מפתחות סודיים חייבים להישאר מחוץ להישג יד של מסך ההגדרות');

check('מספר דוחה טקסט', threw(() => settings.validate('PORT', 'abc')) !== null);
check('מספר דוחה ערך מתחת למינימום', threw(() => settings.validate('PORT', '80')) !== null);
check('מספר דוחה ערך מעל למקסימום', threw(() => settings.validate('PORT', '99999')) !== null);
check('מספר תקין מתקבל', settings.validate('PORT', '8080') === '8080');

// ערך עם מעבר שורה היה מפצל את קובץ ה-.env, והשורה השנייה הייתה נקראת
// כמפתח חדש לגמרי.
check('מעבר שורה נדחה', threw(() => settings.validate('WIN_ALLOWED_PATH', 'C:\\a\nWIN_PERM_COMMANDS=true')) !== null,
      'אחרת אפשר להזריק מפתח נוסף דרך ערך של מפתח אחר');
check('גררת גררה (CR) נדחית גם היא', threw(() => settings.validate('WIN_ALLOWED_PATH', 'C:\\a\rX=1')) !== null);
check('ערך ארוך מדי נדחה', threw(() => settings.validate('WIN_ALLOWED_PATH', 'x'.repeat(3000))) !== null);

console.log('');
console.log('=== כתיבה ל-.env ===');

settings.updateEnvFile({ WIN_PERM_WRITE: 'true', WIN_PERM_INSTALL: 'false', WIN_MAX_READ_BYTES: '2048' });
const after = fs.readFileSync(ENV, 'utf8');

check('ערך קיים עודכן במקומו', /^WIN_PERM_WRITE=true$/m.test(after));
check('לא נוצרה שורה כפולה', (after.match(/WIN_PERM_WRITE=/g) || []).length === 1,
      'נמצאו ' + (after.match(/WIN_PERM_WRITE=/g) || []).length);

// שורה מוסמנת בהערה היא בדיוק האופן שבו הקובץ מתעד הגדרה כבויה. הדלקה
// צריכה להחליף אותה, לא להוסיף שורה שנייה שסותרת אותה.
check('שורה מוסמנת בהערה הוחלפה ולא שוכפלה',
      /^WIN_PERM_INSTALL=false$/m.test(after) && !/^# WIN_PERM_INSTALL/m.test(after));

check('מפתח חדש נוסף', /^WIN_MAX_READ_BYTES=2048$/m.test(after));

check('ההערות שרדו', after.includes('# הרשאות Windows - תקרה, לא ברירת מחדל.'));
check('מפתח שאינו בסכימה שרד', after.includes('GITHUB_CLIENT_SECRET=super-secret-value'),
      'שמירה מהמסך לא רשאית למחוק מפתחות OAuth');
check('מפתח נוסף שאינו בסכימה שרד', after.includes('NOTION_CLIENT_ID=abc123'));
check('PORT לא נגע', /^PORT=3000$/m.test(after));

console.log('');
console.log('=== סוד אינו מוחזר לתצוגה ===');
process.env.BRIDGE_AUTH_TOKEN = 'a-real-token';
const shown = settings.currentSettings().find((s) => s.key === 'BRIDGE_AUTH_TOKEN');
check('הערך עצמו אינו נשלח', shown && shown.value === '');
check('רק העובדה שהוא מוגדר', shown && shown.isSet === true);
delete process.env.BRIDGE_AUTH_TOKEN;

console.log('');
console.log('=== החלה: הכל נבדק לפני שמשהו נכתב ===');
const before = fs.readFileSync(ENV, 'utf8');
const err = threw(() => settings.applySettings({ WIN_PERM_READ: false, PORT: 'notanumber' }));
check('תיקון עם ערך פסול נכשל', err !== null);
check('ולא נכתב ממנו כלום', fs.readFileSync(ENV, 'utf8') === before,
      'אחרת חצי מהשינויים היו נשמרים והמשתמש לא היה יודע אילו');

// טוקן ריק פירושו "אל תיגע", לא "מחק" - הוא לעולם אינו מוחזר לתצוגה, ולכן
// כל שמירה של המסך הייתה מוחקת אותו.
process.env.BRIDGE_AUTH_TOKEN = 'keep-me';
settings.applySettings({ BRIDGE_AUTH_TOKEN: '' });
check('טוקן ריק אינו מוחק את הקיים', process.env.BRIDGE_AUTH_TOKEN === 'keep-me');
delete process.env.BRIDGE_AUTH_TOKEN;

fs.rmSync(TMP_DIR, { recursive: true, force: true });

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
