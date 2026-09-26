'use strict';

/**
 * עריכת הגדרות הגשר מתוך התוסף.
 *
 * הרקע: עד כה כל ההגדרות היו נעולות בקובץ .env, ומי שרצה לשנות משהו היה
 * צריך לערוך קובץ ולהפעיל מחדש. הבקשה הייתה שהכל יהיה נגיש מהפאנל.
 *
 * מה שלא השתנה, ובכוונה: מודל התקרה נשאר. הבקשה הבודדת עדיין אינה יכולה
 * להעניק לעצמה הרשאה - היא יכולה רק לצמצם. מה שהשתנה הוא מי עורך את התקרה:
 * במקום עורך טקסט, הפופאפ.
 *
 * למה זה בטוח: הנתיב הזה עובר דרך אותה שכבת Origin, CORS ואימות שדרכה
 * עוברת /api/windows/execute - שכבר היום יכולה להריץ פקודות ולמחוק קבצים.
 * כלומר מי שמסוגל להגיע לכאן כבר מסוגל ליותר מזה ממילא, וההבדל היחיד הוא
 * שכאן השינוי נשמר לקובץ, גלוי, ונרשם ביומן הביקורת - בניגוד להחלטה
 * חד-פעמית בגוף בקשה שאיש לא רואה.
 *
 * מה שכן נשאר מחוץ להישג יד: תיקיות המערכת (Windows, Program Files,
 * AppData, ‎.ssh) חסומות בקוד ואינן הגדרה. אין דרך להדליק אותן מכאן.
 */

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');

/**
 * כל הגדרה שניתן לערוך. מה שאינו כאן אינו ניתן לעריכה מרחוק - וזה כולל
 * במפורש את מפתחות ה-OAuth ואת מחרוזות החיבור ל-Supabase.
 */
const SCHEMA = [
  // --- הרשאות ---
  {
    key: 'WIN_PERM_READ', type: 'bool', group: 'permissions', def: true,
    label: 'קריאת קבצים',
    description: 'לקרוא קבצים ולרשום תוכן תיקיות בתוך תחום הקריאה.',
  },
  {
    key: 'WIN_PERM_WRITE', type: 'bool', group: 'permissions', def: false,
    label: 'כתיבה ומחיקה',
    description: 'ליצור, לשנות, להעביר ולמחוק קבצים בתוך תחום הכתיבה בלבד.',
  },
  {
    key: 'WIN_PERM_COMMANDS', type: 'bool', group: 'permissions', def: false,
    label: 'הרצת פקודות',
    description: 'הרצת פקודות PowerShell ו-CMD. ההרשאה הרחבה ביותר כאן.',
  },
  {
    key: 'WIN_PERM_APPS', type: 'bool', group: 'permissions', def: true,
    label: 'פתיחת תוכנות',
    description: 'לפתוח תוכנות מותקנות ולהעביר חלונות לחזית.',
  },
  {
    key: 'WIN_PERM_CLIPBOARD', type: 'bool', group: 'permissions', def: true,
    label: 'לוח העתקה',
    description: 'לקרוא ולכתוב ללוח ההעתקה של Windows.',
  },
  {
    key: 'WIN_PERM_INSTALL', type: 'bool', group: 'permissions', def: true,
    label: 'הורדה והתקנה',
    description: 'תקרה בלבד. גם כשהיא דלוקה, כל התקנה עוצרת לאישור וניתנת לביטול.',
  },

  {
    key: 'WIN_PERM_GITHUB_CLI', type: 'bool', group: 'permissions', def: true,
    label: 'GitHub דרך המחשב',
    description: 'שימוש ב-gh שכבר מחובר במחשב, במקום טוקן נפרד. מוגבל לרשימת פקודות, ומה שמשנה מצב עוצר לאישור.',
  },

  // --- תחומים ---
  {
    key: 'WIN_READ_PATH', type: 'path', group: 'scope', def: '*',
    label: 'תחום קריאה',
    description: 'מאיפה מותר לקרוא. הערך * פותח את כל המחשב, למעט תיקיות המערכת שחסומות תמיד.',
  },
  {
    key: 'WIN_ALLOWED_PATH', type: 'path', group: 'scope', def: '',
    label: 'תחום כתיבה',
    description: 'איפה מותר לשנות, ליצור ולמחוק. ריק = שולחן העבודה. * = כל המחשב, בבחירה מודעת.',
  },
  {
    key: 'WIN_EXTRA_BLOCKED_PATHS', type: 'text', group: 'scope', def: '',
    label: 'תיקיות חסומות נוספות',
    description: 'נתיבים שייחסמו תמיד, גם בתוך התחום המותר. מופרדים בנקודה-פסיק.',
  },

  // --- מגבלות ---
  {
    key: 'WIN_MAX_READ_BYTES', type: 'int', group: 'limits', def: '10485760',
    label: 'גודל קריאה מרבי',
    description: 'התקרה לקריאת קובץ בודד, בבתים. ברירת מחדל 10MB.',
    min: 1024, max: 1073741824,
  },
  {
    key: 'WIN_COMMAND_TIMEOUT_MS', type: 'int', group: 'limits', def: '30000',
    label: 'פסק זמן לפקודה',
    description: 'כמה זמן פקודה בודדת רשאית לרוץ, במילישניות.',
    min: 1000, max: 600000,
  },
  {
    key: 'WIN_DOWNLOAD_MAX_BYTES', type: 'int', group: 'limits', def: '209715200',
    label: 'גודל הורדה מרבי',
    description: 'התקרה להורדת קובץ מהאינטרנט, בבתים. ברירת מחדל 200MB.',
    min: 1024, max: 5368709120,
  },
  {
    key: 'WIN_PLAN_DEADLINE_MS', type: 'int', group: 'limits', def: '120000',
    label: 'פסק זמן לתוכנית',
    description: 'התקרה לתוכנית רב-שלבית שלמה. בלעדיה הגשר עלול להיתפס לדקות ארוכות.',
    min: 5000, max: 1800000,
  },
  {
    key: 'WIN_AUDIT_MAX_BYTES', type: 'int', group: 'limits', def: '5242880',
    label: 'גודל יומן ביקורת',
    description: 'מאיזה גודל היומן מסתובב, בבתים.',
    min: 65536, max: 1073741824,
  },

  // --- אחר ---
  {
    key: 'SUPABASE_ALLOW_WRITES', type: 'bool', group: 'other', def: false,
    label: 'כתיבה ל-Supabase',
    description: 'ברירת המחדל היא קריאה בלבד.',
  },
  {
    key: 'PORT', type: 'int', group: 'other', def: '3000', restart: true,
    label: 'פורט הגשר',
    description: 'שינוי דורש הפעלה מחדש של הגשר, וגם עדכון הכתובת בתוסף.',
    min: 1024, max: 65535,
  },
  {
    key: 'BRIDGE_AUTH_TOKEN', type: 'secret', group: 'other', def: '', restart: true,
    label: 'טוקן אימות',
    description: 'שכבת אימות אופציונלית. ריק = כבוי. שינוי דורש הפעלה מחדש.',
  },
  {
    key: 'BRIDGE_API_KEY', type: 'secret', group: 'other', def: '', restart: false,
    label: 'מפתח API מקומי (OpenAI Compatible)',
    description: 'מפתח גישה מאובטח ל-Endpoint תואם OpenAI בכתובת /v1/chat/completions.',
  },
];

const BY_KEY = {};
for (const s of SCHEMA) BY_KEY[s.key] = s;

function isTruthy(v) {
  return String(v).trim().toLowerCase() === 'true';
}

/**
 * הערך שבתוקף כרגע עבור מפתח, אחרי שכבת ברירות המחדל.
 */
function effective(def) {
  const raw = process.env[def.key];
  if (def.type === 'bool') {
    if (raw === undefined || raw === '') return def.def;
    return isTruthy(raw);
  }
  if (raw === undefined) return def.def;
  return raw;
}

/**
 * המצב הנוכחי, בצורה שהתוסף יכול להציג. ערך רגיש לעולם אינו מוחזר - רק
 * האם הוא מוגדר. אחרת מסך ההגדרות היה הופך לדרך נוחה לדלות את הטוקן.
 */
function currentSettings() {
  return SCHEMA.map((def) => {
    const base = {
      key: def.key,
      type: def.type,
      group: def.group,
      label: def.label,
      description: def.description,
      restart: Boolean(def.restart),
    };
    if (def.type === 'secret') {
      return { ...base, value: '', isSet: Boolean(String(process.env[def.key] || '').trim()) };
    }
    if (def.type === 'int') {
      return { ...base, value: String(effective(def)), min: def.min, max: def.max };
    }
    return { ...base, value: effective(def) };
  });
}

/**
 * בדיקת ערך יחיד מול הסכימה. מחזיר את הערך שיש לכתוב, או זורק.
 */
function validate(key, value) {
  const def = BY_KEY[key];
  if (!def) {
    const e = new Error(`'${key}' אינו הגדרה שניתן לערוך.`);
    e.status = 400;
    throw e;
  }

  if (def.type === 'bool') {
    if (typeof value !== 'boolean') {
      const e = new Error(`'${def.label}' מקבל true או false בלבד.`);
      e.status = 400;
      throw e;
    }
    return value ? 'true' : 'false';
  }

  const str = String(value === undefined || value === null ? '' : value).trim();

  // ערך שמכיל שורה חדשה היה שובר את קובץ ה-.env לשתי שורות, והשנייה
  // הייתה נקראת כמפתח נפרד לגמרי.
  if (str.includes('\n') || str.includes('\r')) {
    const e = new Error(`'${def.label}' אינו יכול להכיל מעבר שורה.`);
    e.status = 400;
    throw e;
  }
  if (str.length > 2000) {
    const e = new Error(`'${def.label}' ארוך מדי.`);
    e.status = 400;
    throw e;
  }

  if (def.type === 'int') {
    if (str === '') return '';
    if (!/^\d+$/.test(str)) {
      const e = new Error(`'${def.label}' מקבל מספר שלם בלבד.`);
      e.status = 400;
      throw e;
    }
    const n = Number(str);
    if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
      const e = new Error(`'${def.label}' חייב להיות בין ${def.min} ל-${def.max}.`);
      e.status = 400;
      throw e;
    }
    return str;
  }

  return str;
}

// ---------------------------------------------------------------------------
// כתיבה ל-.env
//
// הקובץ נערך בשורות ולא נכתב מחדש: הוא מלא הערות שמסבירות כל הגדרה, וגם
// מכיל מפתחות שאינם בסכימה - מפתחות OAuth, חיבורי Supabase. כתיבה מחדש
// מתוך הסכימה בלבד הייתה מוחקת את שניהם.
// ---------------------------------------------------------------------------
function updateEnvFile(patch) {
  let text = '';
  try {
    text = fs.readFileSync(ENV_PATH, 'utf8');
  } catch (e) {
    text = '# נוצר על ידי מסך ההגדרות של GemMCP\n';
  }

  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const remaining = { ...patch };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // גם שורה שהוסמנה כהערה נחשבת: '# WIN_PERM_INSTALL=false' הוא בדיוק
    // האופן שבו הקובץ מתעד הגדרה כבויה, והדלקתה צריכה להחליף אותה במקום
    // להוסיף שורה שנייה שסותרת אותה.
    const body = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!Object.prototype.hasOwnProperty.call(remaining, key)) continue;

    lines[i] = `${key}=${remaining[key]}`;
    delete remaining[key];
  }

  const added = Object.keys(remaining);
  if (added.length) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push('# נוסף ממסך ההגדרות של התוסף');
    for (const key of added) lines.push(`${key}=${remaining[key]}`);
  }

  const out = lines.join(nl);
  const tmp = ENV_PATH + '.tmp';
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, ENV_PATH);
  return { written: Object.keys(patch), added };
}

/**
 * מחיל תיקון: בודק הכל קודם, ורק אחר כך כותב. בדיקה תוך כדי כתיבה הייתה
 * משאירה חצי מהשינויים בקובץ כשהערך השני פסול.
 *
 * @param {object} raw זוגות מפתח/ערך מהתוסף
 * @returns {{written: string[], restartNeeded: string[]}}
 */
function applySettings(raw) {
  if (!raw || typeof raw !== 'object') {
    const e = new Error('לא נשלחו הגדרות.');
    e.status = 400;
    throw e;
  }

  const patch = {};
  const restartNeeded = [];
  for (const [key, value] of Object.entries(raw)) {
    const def = BY_KEY[key];
    // טוקן ריק פירושו "אל תיגע", לא "מחק". אחרת כל שמירה של המסך הייתה
    // מוחקת את הטוקן, כי הוא לעולם אינו מוחזר לתצוגה.
    if (def && def.type === 'secret' && String(value || '') === '') continue;
    patch[key] = validate(key, value);
    if (def.restart) restartNeeded.push(key);
  }

  if (!Object.keys(patch).length) return { written: [], restartNeeded: [] };

  updateEnvFile(patch);
  for (const [key, value] of Object.entries(patch)) process.env[key] = value;

  return { written: Object.keys(patch), restartNeeded };
}

module.exports = { SCHEMA, BY_KEY, currentSettings, applySettings, validate, updateEnvFile, ENV_PATH };
