/**
 * מריץ תוכנית: רצף פעולות עם העברת ערכים ביניהן.
 *
 * למה זה קיים: עד עכשיו כל פקודה עמדה בפני עצמה, בלי זיכרון ובלי המשכיות.
 * משימה אמיתית - "מצא את כל ה-PDF-ים והעבר אותם לתיקייה" - דרשה עשרות סבבים
 * דרך הצ'אט, כשהמודל מקליד מחדש את התוצאה של כל שלב. כאן הרצף רץ בצד השרת.
 *
 * זה גם שיפור אבטחה ולא רק נוחות: המשתמש מאשר תוכנית אחת קריאה במקום עשרים
 * כרטיסים נפרדים, ועייפות אישורים היא הסכנה האמיתית בכלי כזה.
 *
 * הפניות בין שלבים:
 *   {"action":"find_files", "pattern":"*.pdf", "as":"pdfs"}
 *   {"action":"copy_file",  "from":"$pdfs[0].path", "to":"~/Docs"}
 *
 * נתמך: $name, $name.field, $name[i], ושרשור ביניהם. אין ביטויים ואין קוד -
 * רק שליפת ערך מתוך תוצאה קודמת.
 */

const MAX_STEPS = 40;

// תקרת זמן לכל התוכנית. בלעדיה 40 שלבים כפול 30 שניות פסק-זמן לפקודה נותנים
// עשרים דקות שבהן הגשר תפוס, הרבה אחרי שהמשתמש כבר הפסיק לחכות ושכח שאישר.
const DEFAULT_DEADLINE_MS = Number(process.env.WIN_PLAN_DEADLINE_MS) || 120000;

// שדות שערך מוחלף לעולם לא ייכנס אליהם. הסיבה אינה תיאורטית: המשתמש מאשר
// כרטיס שמציג  run_command: "del $pdfs[0].path" , ומה שרץ בפועל הוא מחרוזת
// PowerShell שהורכבה משם קובץ מהדיסק. שם קובץ הוא קלט שאפשר לשתול, ולכן זה
// ערוץ הזרקה: מה שאושר ומה שהורץ אינם אותו טקסט.
const NO_SUBSTITUTION = { run_command: ['command'] };

// שמות שאסור להשתמש בהם כשם שלב או כשדה בהפניה. בלעדיהם הפניה כמו
// $constructor או $x.__proto__ הייתה שולפת אובייקט מתוך שרשרת הפרוטוטייפ
// ומכניסה אותו לפרמטר של פעולה.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// שליפת ערך לפי נתיב כמו  pdfs[0].path  מתוך מפת התוצאות.
// רק תכונות עצמיות נקראות - לעולם לא דרך שרשרת הפרוטוטייפ.
function resolveReference(ref, results) {
  const body = ref.slice(1);                       // מסירים את ה-$
  const head = body.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if (!head || FORBIDDEN_KEYS.has(head[0])) return undefined;
  if (!Object.prototype.hasOwnProperty.call(results, head[0])) return undefined;

  let value = results[head[0]];
  let rest = body.slice(head[0].length);

  while (rest.length && value !== undefined && value !== null) {
    const idx = rest.match(/^\[(\d+)\]/);
    if (idx) {
      value = Array.isArray(value) ? value[Number(idx[1])] : undefined;
      rest = rest.slice(idx[0].length);
      continue;
    }
    const field = rest.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
    if (field) {
      const key = field[1];
      if (FORBIDDEN_KEYS.has(key) || typeof value !== 'object' ||
          !Object.prototype.hasOwnProperty.call(value, key)) {
        return undefined;
      }
      value = value[key];
      rest = rest.slice(field[0].length);
      continue;
    }
    break;                                          // תחביר לא מוכר - עוצרים
  }

  // פונקציה לעולם אינה ערך לגיטימי לפרמטר של פעולה
  return typeof value === 'function' ? undefined : value;
}

// הפניה שלא נפתרה עוצרת את התוכנית. קודם היא נשארה כטקסט גולמי, ואז
// "$pdfs[0].path" הפך לשם קובץ תקין לחלוטין - התוכנית המשיכה לרוץ בשקט על
// נתיב שאין לו שום קשר למה שהמשתמש אישר.
function failRef(ref) {
  const e = new Error(`ההפניה ${ref} אינה מצביעה על תוצאה קיימת. בדוק את שם השלב (as) ואת המבנה שהוא החזיר.`);
  e.status = 400;
  throw e;
}

// החלפת הפניות בתוך הפרמטרים של שלב
function substitute(params, results) {
  if (params === null || params === undefined) return params;

  if (typeof params === 'string') {
    // מחרוזת שהיא כולה הפניה - מחזירים את הערך עצמו ולא טקסט
    if (/^\$[A-Za-z_][A-Za-z0-9_[\]().]*$/.test(params)) {
      const v = resolveReference(params, results);
      if (v === undefined) failRef(params);
      return v;
    }
    // הפניה משובצת בתוך טקסט - הופכים למחרוזת
    return params.replace(/\$[A-Za-z_][A-Za-z0-9_[\]().]*/g, (m) => {
      const v = resolveReference(m, results);
      if (v === undefined) failRef(m);
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }

  if (Array.isArray(params)) return params.map((x) => substitute(x, results));

  if (typeof params === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = substitute(v, results);
    return out;
  }

  return params;
}

// איתור הפניות בשדות שאסור להחליף בהם, לפני שרצה ולו שלב אחד. נכשלים על כל
// התוכנית ולא רק על השלב הבעייתי, כי חצי תוכנית שרצה משאירה מצב על הדיסק.
function rejectUnsafeReferences(steps) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const fields = NO_SUBSTITUTION[step.action];
    if (!fields) continue;
    for (const f of fields) {
      const v = step[f];
      if (typeof v === 'string' && /\$[A-Za-z_][A-Za-z0-9_]*/.test(v)) {
        const e = new Error(
          `שלב ${i + 1}: אסור להשתמש בהפניה כמו ${v.match(/\$[A-Za-z_][A-Za-z0-9_]*/)[0]} בתוך '${f}' של ${step.action}. ` +
          'הטקסט שהיית מאשר אינו הטקסט שהיה רץ. השתמש בפעולה ייעודית (copy_file, move_file, delete_file) במקום.'
        );
        e.status = 400;
        throw e;
      }
    }
  }
}

/**
 * @param {Array}    steps      רשימת שלבים: { action, as?, ...params }
 * @param {Function} runAction  async (action, params) -> data ; זורק עם .status
 */
async function runPlan(steps, runAction) {
  if (!Array.isArray(steps) || steps.length === 0) {
    const e = new Error('התוכנית ריקה או אינה מערך.');
    e.status = 400;
    throw e;
  }
  if (steps.length > MAX_STEPS) {
    const e = new Error(`תוכנית ארוכה מדי: ${steps.length} שלבים, המקסימום ${MAX_STEPS}.`);
    e.status = 400;
    throw e;
  }

  rejectUnsafeReferences(steps);

  const results = Object.create(null);   // ללא prototype - אין מה לזהם
  const log = [];
  const deadline = Date.now() + DEFAULT_DEADLINE_MS;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const action = step.action;
    if (!action) {
      const e = new Error(`שלב ${i + 1} חסר action.`);
      e.status = 400;
      throw e;
    }

    if (Date.now() > deadline) {
      const e = new Error(
        `התוכנית חרגה ממגבלת הזמן (${Math.round(DEFAULT_DEADLINE_MS / 1000)} שניות) ונעצרה לפני שלב ${i + 1}.`
      );
      e.status = 504;
      e.partial = { completed: i, total: steps.length, log, results };
      throw e;
    }

    const { action: _a, as: rawAlias, ...rawParams } = step;
    const alias = (typeof rawAlias === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawAlias) &&
                   !FORBIDDEN_KEYS.has(rawAlias)) ? rawAlias : null;
    if (rawAlias && !alias) {
      const e = new Error(`שלב ${i + 1}: שם התוצאה '${rawAlias}' אינו חוקי.`);
      e.status = 400;
      throw e;
    }
    const params = substitute(rawParams, results);

    const started = Date.now();
    try {
      const data = await runAction(action, params);
      if (alias) results[alias] = data;
      log.push({ step: i + 1, action, alias: alias || null, ok: true, ms: Date.now() - started });
    } catch (err) {
      // עוצרים בכישלון הראשון. תוכנית שממשיכה אחרי שלב שנכשל תפעל על הנחות
      // שכבר אינן נכונות, וזה מסוכן יותר מלעצור.
      log.push({ step: i + 1, action, ok: false, ms: Date.now() - started, error: err.message });
      const e = new Error(`התוכנית נעצרה בשלב ${i + 1} (${action}): ${err.message}`);
      e.status = err.status || 500;
      e.partial = { completed: i, total: steps.length, log, results };
      throw e;
    }
  }

  return { completed: steps.length, total: steps.length, log, results };
}

module.exports = { runPlan, substitute, resolveReference, rejectUnsafeReferences, MAX_STEPS };
