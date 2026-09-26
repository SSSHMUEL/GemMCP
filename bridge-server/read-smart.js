/**
 * קריאת קבצים לפי הסוג שלהם, ולא כאילו הכול טקסט.
 *
 * למה זה קיים: read_file קרא כל קובץ כ-utf8. עבור PDF, Word או תמונה זה
 * מחזיר ג'יבריש בינארי - ואז המודל מקבל אלפי תווים חסרי משמעות, מנסה
 * לפרש אותם, ועונה שטויות. גרוע מכך, המשתמש לא מבין למה: הפעולה "הצליחה".
 *
 * כאן כל סוג מטופל לפי מה שהוא: מסמכים מומרים לטקסט, בינארי מזוהה ומדווח
 * ככזה במקום להישפך, וטקסט רגיל ממשיך בדיוק כמו קודם.
 */
const fs = require('fs');
const path = require('path');

// תקרה נפרדת לחילוץ: מסמך של 200MB יתפוס את הגשר, שהוא חד-תהליכי, לזמן
// ארוך. מוטב לסרב מפורשות מאשר להיתקע.
// תקרת הקריאה היא הגדרה, ונקראת בכל קריאה כדי ששינוי יחול מיד.
// 40MB נשארת התקרה הקשיחה לחילוץ מסמכים, גם אם ההגדרה גבוהה ממנה.
const MAX_EXTRACT_BYTES = 40 * 1024 * 1024;
function maxReadBytes() {
  const n = Number(process.env.WIN_MAX_READ_BYTES);
  if (!Number.isFinite(n) || n < 1024) return 10 * 1024 * 1024;
  return Math.min(n, MAX_EXTRACT_BYTES);
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.log', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sh', '.ps1', '.bat', '.sql',
  '.html', '.htm', '.css', '.scss', '.ini', '.cfg', '.conf', '.env', '.toml', '.gitignore'
]);

/**
 * זיהוי בינארי אמיתי, ולא לפי סיומת בלבד. קובץ בלי סיומת מוכרת עדיין עשוי
 * להיות טקסט, וקובץ עם סיומת .txt עשוי להיות בינארי.
 *
 * הסימן החד-משמעי הוא בית אפס: הוא אינו מופיע בטקסט utf8 תקין.
 */
function looksBinary(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  if (sample.includes(0)) return true;

  // שיעור גבוה של בתי בקרה שאינם רווח, טאב, שורה חדשה או חזרת גררה
  let control = 0;
  for (const b of sample) {
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return sample.length > 0 && control / sample.length > 0.15;
}

async function extractPdf(filePath) {
  // pdf-parse 2.x מייצא מחלקה, לא פונקציה. הקריאה הישנה pdfParse(buffer)
  // זרקה "not a function", ה-catch בלע אותה, וכל PDF חזר עם אפס תווים -
  // כלומר נראה כמו מסמך ריק ולא ככשל.
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const out = await parser.getText();
    return { text: out.text || '', meta: { pages: out.total } };
  } finally {
    try { await parser.destroy(); } catch (e) { /* משחררים ולא מפילים */ }
  }
}

async function extractDocx(filePath) {
  const mammoth = require('mammoth');
  const out = await mammoth.extractRawText({ path: filePath });
  return { text: out.value || '', meta: {} };
}

/**
 * @returns {Promise<{kind, text, meta, note}>}
 *   kind: 'text' | 'pdf' | 'docx' | 'binary'
 *   text: התוכן, או '' לבינארי
 *   note: הסבר למשתמש כשאין טקסט להחזיר
 */
async function readSmart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);

  if (ext === '.pdf' || ext === '.docx') {
    if (stat.size > maxReadBytes()) {
      return {
        kind: 'binary', text: '', meta: { bytes: stat.size },
        note: `הקובץ גדול מדי לחילוץ טקסט (${Math.round(stat.size / 1048576)}MB).`
      };
    }
    try {
      const { text, meta } = ext === '.pdf' ? await extractPdf(filePath) : await extractDocx(filePath);
      // PDF סרוק מחזיר טקסט ריק. עדיף לומר זאת מאשר להחזיר מחרוזת ריקה
      // שנראית כמו קובץ ריק.
      if (!text.trim()) {
        return {
          kind: ext.slice(1), text: '', meta,
          note: 'לא נמצא טקסט בקובץ. ייתכן שהוא סרוק כתמונה ודורש OCR.'
        };
      }
      return { kind: ext.slice(1), text, meta, note: null };
    } catch (e) {
      return {
        kind: ext.slice(1), text: '', meta: { bytes: stat.size },
        note: `חילוץ הטקסט נכשל: ${e.message}`
      };
    }
  }

  // קריאה ללא תקרה: כל קובץ נקרא במלואו לזיכרון. קובץ וידאו או גיבוי
  // של כמה ג'יגה היה מפיל את הגשר, ובלי שום הודעה מובנת. התקרה היא
  // ההגדרה "גודל קריאה מרבי", ברירת מחדל 10MB.
  const cap = maxReadBytes();
  if (stat.size > cap) {
    return {
      kind: 'too-large', text: '', meta: { bytes: stat.size, cap },
      note: `הקובץ גדול מהתקרה לקריאה: ${Math.round(stat.size / 1048576)}MB ` +
            `מול ${Math.round(cap / 1048576)}MB. אפשר להעלות את "גודל קריאה מרבי" בהגדרות.`
    };
  }

  const buf = fs.readFileSync(filePath);

  // סיומת טקסט מוכרת גוברת על הניחוש, אבל רק אם הקובץ באמת אינו בינארי.
  if (looksBinary(buf) && !TEXT_EXTENSIONS.has(ext)) {
    return {
      kind: 'binary', text: '', meta: { bytes: stat.size },
      note: `זהו קובץ בינארי (${ext || 'ללא סיומת'}), ולא טקסט. ` +
            'קריאה שלו כטקסט הייתה מחזירה ג׳יבריש.'
    };
  }

  return { kind: 'text', text: buf.toString('utf8'), meta: { bytes: stat.size }, note: null };
}

module.exports = { readSmart, looksBinary, MAX_EXTRACT_BYTES };
