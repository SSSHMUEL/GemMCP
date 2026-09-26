/**
 * מתאם האתר: בחירת האתר לפי הדומיין, וגזירת מזהה השיחה מהכתובת.
 *   node test/site-adapter.test.js
 *
 * מזהה השיחה הוא הדבר היחיד שבאמת חייב להיות נכון לכל אתר בנפרד, כי עליו
 * נשענת ההפעלה לפי שיחה. טעות כאן חוזרת בדיוק לבאג שכבר תוקן פעם: כשכל
 * שיחה חדשה מקבלת את אותו מזהה, הפעלה אחת מפעילה את כולן.
 *
 * שאר ההבדלים בין האתרים הם בוררי DOM, והם תוספת לגנריים ולא החלפה שלהם -
 * בורר שיישבר כשהאתר ישתנה לא יפיל את התוסף. את הבוררים עצמם אי אפשר לבדוק
 * כאן; הם דורשים את האתר החי ומשתמש מחובר.
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

const start = src.indexOf('  const SITES = {');
if (start < 0) {
  console.error('  לא נמצא SITES ב-content.js. אם המבנה השתנה, עדכן כאן.');
  process.exit(1);
}
const end = src.indexOf('  const SITE = (() => {', start);
if (end < 0) {
  console.error('  לא נמצא SITE ב-content.js.');
  process.exit(1);
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + '\nthis.SITES = SITES;', ctx);
const SITES = ctx.SITES;

console.log('');
console.log('=== שלושת האתרים מוגדרים ===');
for (const key of ['gemini', 'claude', 'chatgpt']) {
  check(key + ' קיים', Boolean(SITES[key]));
}
check('ChatGPT מכסה גם את הדומיין הישן',
      SITES.chatgpt.hosts.includes('chatgpt.com') && SITES.chatgpt.hosts.includes('chat.openai.com'));

console.log('');
console.log('=== אין דומיין שמשויך לשני אתרים ===');
const seen = new Map();
let clash = null;
for (const [key, site] of Object.entries(SITES)) {
  for (const h of site.hosts) {
    if (seen.has(h)) clash = h + ' -> ' + seen.get(h) + ' + ' + key;
    seen.set(h, key);
  }
}
check('כל דומיין שייך לאתר אחד', clash === null, clash || '');

console.log('');
console.log('=== מזהה השיחה, לפי מבנה הכתובת של כל אתר ===');

const CASES = [
  // [site, pathname, expected]
  ['gemini', '/app', null],
  ['gemini', '/app/', null],
  ['gemini', '/app/abc123', 'abc123'],
  ['gemini', '/app/abc123/', 'abc123'],
  ['gemini', '/', null],

  ['claude', '/chats', null],
  ['claude', '/new', null],
  ['claude', '/chat/9f8e-uuid', '9f8e-uuid'],
  ['claude', '/', null],

  ['chatgpt', '/', null],
  ['chatgpt', '/c/6821-uuid', '6821-uuid'],
  ['chatgpt', '/g/g-somegpt', null],
];

for (const [key, pathname, want] of CASES) {
  const parts = pathname.split('/').filter(Boolean);
  const got = SITES[key].chatId(parts);
  check(`${key} ${pathname} -> ${want === null ? 'null' : want}`, got === want, 'קיבלתי ' + got);
}

console.log('');
console.log('  שיחה בלי מזהה מחזירה null בכוונה: היא מוחזקת כהפעלה ממתינה');
console.log('  בזיכרון עד שהאתר מקצה כתובת. בלי זה, "כל שיחה חדשה" הופכת');
console.log('  למזהה אחד משותף - וזה בדיוק הבאג שגרם לתוסף לקפוץ בשיחות');
console.log('  שלא הופעל בהן.');

console.log('');
console.log('=== לכל אתר יש את כל השדות ===');
for (const [key, site] of Object.entries(SITES)) {
  check(`${key}: שם`, typeof site.name === 'string' && site.name.length > 0);
  check(`${key}: דומיינים`, Array.isArray(site.hosts) && site.hosts.length > 0);
  check(`${key}: chatId היא פונקציה`, typeof site.chatId === 'function');
  check(`${key}: בוררי תור`, typeof site.turns === 'string' && site.turns.length > 0);
  check(`${key}: בוררי הודעת משתמש`, typeof site.userTurns === 'string' && site.userTurns.length > 0);
  check(`${key}: בוררי הודעות`, typeof site.messages === 'string' && site.messages.length > 0);
  check(`${key}: בוררי עצירה`, Array.isArray(site.stop));
}

console.log('');
console.log('=== ה-manifest מסכים עם המתאם ===');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const matches = manifest.content_scripts[0].matches;
for (const [key, site] of Object.entries(SITES)) {
  for (const h of site.hosts) {
    check(`${key}: ${h} מופיע ב-manifest`,
          matches.some((m) => m.includes(h)),
          'המתאם מכיר דומיין שהתוסף כלל לא נטען בו');
  }
}
for (const m of matches) {
  const host = m.replace('https://', '').replace('/*', '');
  check(`manifest: ${host} מוכר למתאם`, seen.has(host),
        'התוסף נטען באתר שאין לו מתאם - הוא ייפול על ברירת המחדל');
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
