/**
 * הפופאפ חייב לעלות בלי לזרוק.
 *   node test/popup-boot.test.js
 *
 * למה זה קיים: שתי שגיאות ReferenceError ישבו בפופאפ ולא נראו בשום בדיקה.
 * שתיהן מאותו סוג - משתנה שמוצהר ב-const/let בהמשך הקובץ, ונקרא מוקדם יותר
 * מתוך פונקציה שרצה מיד:
 *
 *   applyLanguage() קראה ל-renderCustomServers(), שנשענת על customMcpServersList
 *   loadAllStoredSettings() קראה ל-updatePills(), שקוראת את popupLaunchFailed
 *
 * שתיהן קרו בתוך callback של chrome.storage, ולכן השגיאה לא הגיעה לשום מקום:
 * לא לקונסולה שמישהו מסתכל בה, ובוודאי לא למסך. הפופאפ נראה תקין, ופשוט לא
 * סיים לאתחל את עצמו. רק פתיחה שלו בדפדפן אמיתי עם קונסולה פתוחה גילתה.
 *
 * הבדיקה מריצה את popup.js על DOM מדומה ועל chrome מדומה שקורא ל-callbacks
 * באופן סינכרוני, כך שכל זריקה מגיעה לכאן.
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

/**
 * אלמנט מדומה: כל תכונה שנוגעים בה קיימת, כל פונקציה שקוראים לה מחזירה
 * אלמנט נוסף. המטרה אינה לדמות DOM נכון אלא לאפשר לסקריפט לרוץ עד הסוף,
 * כדי שכל שגיאת ReferenceError תצוף.
 */
function makeElement() {
  const el = {
    style: {}, dataset: {}, classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    checked: false, value: '', textContent: '', innerHTML: '', disabled: false,
    hidden: false, open: false, files: [], options: [], selectedIndex: 0,
addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    remove() {}, focus() {}, click() {}, blur() {}, scrollIntoView() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    hasAttribute() { return false; },
    // בדף האמיתי כל מתג יושב בתוך .switch, ויש קוד שנשען על כך בלי בדיקה
    // (toggleEl.closest('.switch').classList). דמה שמחזיר null היה נכשל שם
    // על נסיבות שאינן קיימות בפועל, ומסתיר את מה שכן מעניין כאן.
    closest() { return makeElement(); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    insertBefore() {}, cloneNode() { return makeElement(); },
  };
  return el;
}

function runPopup(label) {
  const src = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
  const i18n = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  const prompt = fs.readFileSync(path.join(ROOT, 'prompt.js'), 'utf8');

  const listeners = {};
  const doc = {
    readyState: 'loading',
    body: makeElement(),
    documentElement: makeElement(),
    getElementById() { return makeElement(); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
  };

  // ה-callbacks נקראים סינכרונית בכוונה: כך שגיאה בתוכם מגיעה לכאן במקום
  // להיבלע, וזה בדיוק מה שהסתיר את שני הבאגים.
  const store = {};
  const storageArea = {
    get(keys, cb) {
      const out = {};
      if (Array.isArray(keys)) keys.forEach((k) => { if (k in store) out[k] = store[k]; });
      else if (keys === null || keys === undefined) Object.assign(out, store);
      else if (typeof keys === 'string') { if (keys in store) out[keys] = store[keys]; }
      else if (typeof keys === 'object') Object.assign(out, keys, out);
      if (typeof cb === 'function') { cb(out); return undefined; }
      return Promise.resolve(out);
    },
    set(values, cb) {
      Object.assign(store, values);
      if (typeof cb === 'function') { cb(); return undefined; }
      return Promise.resolve();
    },
    remove(keys, cb) { if (typeof cb === 'function') cb(); return Promise.resolve(); },
  };

  const ctx = {
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {} },
    document: doc,
    navigator: { language: 'he', clipboard: { writeText() { return Promise.resolve(); } } },
    location: { href: 'chrome-extension://test/popup/popup.html', pathname: '/popup/popup.html' },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) }); },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    alert() {},
    confirm() { return false; },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob: function Blob() {},
    chrome: {
      runtime: {
        id: 'test', lastError: null,
        getManifest() { return { version: '1.2.4' }; },
        getURL(p) { return p; },
        sendMessage(msg, cb) { if (typeof cb === 'function') cb({ success: false }); },
        onMessage: { addListener() {} },
        openOptionsPage() {},
      },
      storage: { sync: storageArea, local: storageArea, session: storageArea, onChanged: { addListener() {} } },
      tabs: { query(q, cb) { if (typeof cb === 'function') cb([]); }, create() {}, update() {}, sendMessage() {} },
      identity: { launchWebAuthFlow() {} },
      permissions: { contains(p, cb) { if (typeof cb === 'function') cb(true); } },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  vm.runInContext(i18n, ctx, { filename: 'i18n.js' });
  vm.runInContext(prompt, ctx, { filename: 'prompt.js' });
  vm.runInContext(src, ctx, { filename: 'popup.js' });

  // popup.js עוטף הכל ב-DOMContentLoaded. כאן מפעילים אותו.
  const boot = listeners.DOMContentLoaded || [];
  if (!boot.length) throw new Error('popup.js לא רשם מאזין DOMContentLoaded - האם המבנה השתנה?');
  for (const fn of boot) fn({ type: 'DOMContentLoaded' });
  return boot.length;
}

console.log('');
console.log('=== popup.js עולה בלי לזרוק ===');

let bootError = null;
let handlers = 0;
try {
  handlers = runPopup();
} catch (e) {
  bootError = e;
}

check('נרשם מאזין DOMContentLoaded', bootError === null || !/DOMContentLoaded/.test(bootError.message),
      bootError ? bootError.message : '');
if (bootError && process.env.GEMMCP_TRACE) console.log(bootError.stack);
check('האתחול הסתיים בלי חריגה', bootError === null,
      bootError ? (bootError.name + ': ' + bootError.message) : '');

if (bootError && /before initialization/.test(bootError.message)) {
  console.log('');
  console.log('   זו בדיוק התקלה שהבדיקה הזו נועדה לתפוס: משתנה const/let');
  console.log('   שנקרא לפני ההצהרה עליו. העבר את ההצהרה למעלה, או דחה את הקריאה.');
}

check('רץ מאזין אחד בדיוק', handlers === 1 || bootError !== null, 'נמצאו ' + handlers);

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
