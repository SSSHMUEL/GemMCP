'use strict';

/**
 * מסד נתונים מקומי לגשר.
 *
 * למה קובצי JSON ולא SQLite: better-sqlite3 דורש הידור נייטיב, כלומר שרשרת
 * כלי בנייה על המחשב של כל מי שמתקין. הפרויקט הזה נשלח כ-ZIP למי שיש לו
 * Node בלבד, ו-npm install שנכשל על גרסת מהדר הוא כישלון התקנה מוחלט.
 * אוסף של כמה אלפי רשומות נקרא מקובץ JSON במילישניות בודדות, וזה כל מה
 * שנדרש כאן.
 *
 * הכתיבה אטומית: קודם לקובץ זמני ואז rename. כתיבה ישירה שנקטעת באמצע -
 * כיבוי, קריסה, ניתוק - משאירה JSON חתוך שלא ניתן לפרסר, כלומר איבוד האוסף
 * כולו במקום איבוד העדכון האחרון בלבד.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// שם אוסף נכנס מבקשת HTTP ומרכיב נתיב קובץ. בלי האכיפה הזו '../../server'
// היה אוסף תקף לחלוטין מבחינת הקוד.
const SAFE_NAME = new RegExp('^[a-z][a-z0-9_-]{0,39}$');

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) { /* קיים כבר, או שהכתיבה תיכשל בהמשך עם שגיאה ברורה */ }
}

function assertName(name) {
  const n = String(name || '');
  if (!SAFE_NAME.test(n)) {
    const err = new Error(`שם אוסף לא תקין: '${n}'. מותר אותיות קטנות, ספרות, מקף וקו תחתון.`);
    err.status = 400;
    throw err;
  }
  return n;
}

function filePath(name) {
  return path.join(DATA_DIR, assertName(name) + '.json');
}

/**
 * קורא אוסף. אוסף שלא קיים אינו שגיאה - הוא פשוט ריק.
 */
function readCollection(name) {
  const p = filePath(name);
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return { name, items: [], count: 0, updatedAt: null, meta: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      name,
      items,
      count: items.length,
      updatedAt: parsed.updatedAt || null,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
    };
  } catch (e) {
    // קובץ פגום אינו מוחק את עצמו בשקט. מדווחים ומחזירים ריק, כדי שהמשתמש
    // יראה שהאוסף צריך איסוף מחדש במקום לחשוב שהוא באמת ריק.
    return { name, items: [], count: 0, updatedAt: null, meta: { corrupt: true } };
  }
}

/**
 * כותב אוסף שלם. מחזיר את המטא-דאטה שנשמרה.
 */
function writeCollection(name, items, meta) {
  const p = filePath(name);
  ensureDir();
  const payload = {
    name,
    updatedAt: new Date().toISOString(),
    meta: meta && typeof meta === 'object' ? meta : {},
    items: Array.isArray(items) ? items : [],
  };
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, p);
  return { name, updatedAt: payload.updatedAt, count: payload.items.length, meta: payload.meta };
}

function deleteCollection(name) {
  const p = filePath(name);
  try {
    fs.unlinkSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * מה קיים במסד, בלי לקרוא את התוכן עצמו.
 */
function listCollections() {
  ensureDir();
  let names;
  try {
    names = fs.readdirSync(DATA_DIR);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    const name = f.slice(0, -5);
    if (!SAFE_NAME.test(name)) continue;
    let stat;
    try { stat = fs.statSync(path.join(DATA_DIR, f)); } catch (e) { continue; }
    const c = readCollection(name);
    out.push({
      name,
      count: c.count,
      updatedAt: c.updatedAt,
      bytes: stat.size,
      corrupt: Boolean(c.meta && c.meta.corrupt),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * חיפוש טקסט חופשי באוסף, עם דירוג פשוט: התאמה מדויקת לפני התחלה, והתחלה
 * לפני הכלה. בלי הדירוג הזה חיפוש 'code' היה מחזיר קודם כל תוכנה שבמקרה
 * המילה מופיעה אי-שם בנתיב שלה.
 *
 * @param {string} name שם האוסף
 * @param {object} opts { q, fields, limit }
 */
function queryCollection(name, opts) {
  const o = opts || {};
  const col = readCollection(name);
  const q = String(o.q || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, Number(o.limit) || 100));
  const fields = Array.isArray(o.fields) && o.fields.length ? o.fields : null;

  if (!q) return { name, count: col.count, updatedAt: col.updatedAt, items: col.items.slice(0, limit) };

  const scored = [];
  for (const item of col.items) {
    if (!item || typeof item !== 'object') continue;
    const keys = fields || Object.keys(item);
    let best = 0;
    for (const k of keys) {
      const v = item[k];
      if (typeof v !== 'string') continue;
      const lv = v.toLowerCase();
      if (lv === q) { best = Math.max(best, 3); }
      else if (lv.startsWith(q)) { best = Math.max(best, 2); }
      else if (lv.includes(q)) { best = Math.max(best, 1); }
    }
    if (best) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    name,
    count: col.count,
    updatedAt: col.updatedAt,
    matched: scored.length,
    items: scored.slice(0, limit).map((s) => s.item),
  };
}

module.exports = {
  DATA_DIR,
  readCollection,
  writeCollection,
  deleteCollection,
  listCollections,
  queryCollection,
};
