/**
 * פעולות קבצים נוספות לגשר GemMCP.
 *
 * למה זה קיים: בלי העתקה, העברה, מחיקה, יצירת תיקייה וחיפוש, המודל נאלץ ליפול
 * ל-run_command בשביל כל פעולת קבצים - כלומר להריץ PowerShell שרירותי. פעולות
 * צרות ומוגדרות מקטינות את הלחץ להדליק את ההרשאה המסוכנת ביותר, ולכן הן שיפור
 * אבטחה ולא רק שיפור נוחות.
 *
 * כל פעולה כאן כפופה לאותה תקרת הרשאות ולאותה בדיקת נתיב כמו שאר הפעולות -
 * המודול לא מקבל גישה עצמאית לדיסק, אלא את הפונקציות מהשרת.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * @param {object} deps
 *   deps.validatePathInScope - זורק אם הנתיב מחוץ לתחום, ומחזיר נתיב מוחלט
 *   deps.perms               - ההרשאות שכבר נפתרו מול התקרה
 */
function createFileActions(deps) {
  const { validatePathInScope, perms } = deps;

  const needWrite = () => {
    if (!perms.writeFiles) {
      const e = new Error('הרשאת כתיבת ועריכת קבצים כבויה בהגדרות התוסף או השרת.');
      e.status = 403;
      throw e;
    }
  };

  const needRead = () => {
    if (!perms.readFiles) {
      const e = new Error('הרשאת קריאת קבצים כבויה בהגדרות התוסף או השרת.');
      e.status = 403;
      throw e;
    }
  };

  const fail = (msg, status) => {
    const e = new Error(msg);
    e.status = status || 400;
    throw e;
  };

  return {
    // -----------------------------------------------------------------------
    make_dir(params) {
      needWrite();
      if (!params.path) fail('חסר פרמטר path');
      const target = validatePathInScope(params.path);
      fs.mkdirSync(target, { recursive: true });
      return { path: target, created: true };
    },

    // -----------------------------------------------------------------------
    copy_file(params) {
      needWrite();
      if (!params.from || !params.to) fail('חסרים פרמטרים from / to');
      // המקור רק נקרא, ולכן הוא כפוף לתחום הקריאה. היעד נכתב, והוא כפוף
      // לתחום הכתיבה. כך אפשר להעתיק קובץ מכל מקום אל התיקייה המורשית,
      // בלי לפתוח את המקור גם לשינוי.
      const from = validatePathInScope(params.from, 'read');
      const to = validatePathInScope(params.to);
      if (!fs.existsSync(from)) fail(`המקור אינו קיים: ${params.from}`, 404);

      // יעד שהוא תיקייה קיימת - שומרים את שם הקובץ המקורי
      let dest = to;
      if (fs.existsSync(to) && fs.statSync(to).isDirectory()) {
        dest = path.join(to, path.basename(from));
      }
      if (fs.existsSync(dest) && !params.overwrite) {
        fail(`היעד כבר קיים: ${dest}. הוסף overwrite=true כדי לדרוס.`, 409);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(from, dest, { recursive: true, force: !!params.overwrite });
      return { from, to: dest };
    },

    // -----------------------------------------------------------------------
    move_file(params) {
      needWrite();
      if (!params.from || !params.to) fail('חסרים פרמטרים from / to');
      const from = validatePathInScope(params.from);
      const to = validatePathInScope(params.to);
      if (!fs.existsSync(from)) fail(`המקור אינו קיים: ${params.from}`, 404);

      let dest = to;
      if (fs.existsSync(to) && fs.statSync(to).isDirectory()) {
        dest = path.join(to, path.basename(from));
      }
      if (fs.existsSync(dest) && !params.overwrite) {
        fail(`היעד כבר קיים: ${dest}. הוסף overwrite=true כדי לדרוס.`, 409);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(from, dest);
      return { from, to: dest };
    },

    // -----------------------------------------------------------------------
    // מחיקה לסל המיחזור ולא מחיקה קשה. פעולה שמודל מייצר צריכה להיות הפיכה.
    delete_file(params) {
      needWrite();
      if (!params.path) fail('חסר פרמטר path');
      const target = validatePathInScope(params.path);
      if (!fs.existsSync(target)) fail(`הנתיב אינו קיים: ${params.path}`, 404);

      // מחיקת תיקייה גוררת את כל מה שמתחתיה. "מחק את תיקיית הטיוטות" נראה
      // תמים בכרטיס האישור גם כשמתחתיה אלפי קבצים, וסל המיחזור מוותר בשקט על
      // מחיקות גדולות. לכן דורשים דגל מפורש ומדווחים כמה פריטים באמת נמחקים.
      const isDir = fs.statSync(target).isDirectory();
      let itemCount = 0;
      if (isDir) {
        try { itemCount = fs.readdirSync(target, { recursive: true }).length; } catch (e) {}
        if (itemCount > 0 && !params.recursive) {
          fail(`'${path.basename(target)}' היא תיקייה ובתוכה ${itemCount} פריטים. ` +
               'הוסף recursive=true כדי למחוק אותה על תוכנה.', 409);
        }
      }

      return new Promise((resolve, reject) => {
        // Shell.Application מעביר לסל המיחזור; fs.rmSync היה מוחק לצמיתות
        const ps = [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
          'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
          (isDir
            ? `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${target.replace(/'/g, "''")}','OnlyErrorDialogs','SendToRecycleBin')`
            : `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${target.replace(/'/g, "''")}','OnlyErrorDialogs','SendToRecycleBin')`)
        ];
        execFile('powershell.exe', ps, { timeout: 15000 }, (err) => {
          if (err) return reject(Object.assign(new Error(`המחיקה נכשלה: ${err.message}`), { status: 500 }));
          resolve({ path: target, movedToRecycleBin: true, isDirectory: isDir, items: itemCount });
        });
      });
    },

    // -----------------------------------------------------------------------
    // חיפוש לפי תבנית, עם עימוד. מחליף את הצורך ב-Get-ChildItem דרך run_command.
    find_files(params) {
      needRead();
      // ברירת מחדל: התחום המותר, ולא תיקיית העבודה של השרת. '.' היה מתפרש
      // כתיקיית bridge-server, שאין שום סיבה שהמודל יסרוק אותה.
      const root = validatePathInScope(params.path || perms.readPath || perms.allowedPath || '.', 'read');
      if (!fs.existsSync(root)) fail(`התיקייה אינה קיימת: ${params.path}`, 404);

      let pattern = String(params.pattern || '*');
      if (pattern.length > 200) fail('התבנית ארוכה מדי (מקסימום 200 תווים).');

      // רצף כוכביות מתקפל לאחת. '**' זהה ל-'*' מבחינת glob, אבל בתרגום ישיר
      // הוא הופך ל-'.*.*' ויוצר backtracking קטסטרופלי: תבנית כמו '***...*x'
      // הקפיאה את הרגקס מעל 40 שניות ומשתקת את הגשר, שהוא חד-תהליכי.
      pattern = pattern.replace(/[*]{2,}/g, '*');
      // glob פשוט: * ו-? בלבד, מתורגם ל-RegExp אחרי בריחה של כל השאר
      const rx = new RegExp('^' + pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') + '$', 'i');

      // max_depth מגיע מהמודל. בלי חסם, max_depth=999999 על תיקייה עמוקה סורק
      // עץ שלם, והגשר חד-תהליכי - כלומר כל בקשה אחרת ממתינה עד שיסיים.
      const MAX_ALLOWED_DEPTH = 24;
      const rawDepth = Number.isInteger(params.max_depth) ? params.max_depth : 6;
      const maxDepth = Math.min(Math.max(0, rawDepth), MAX_ALLOWED_DEPTH);
      const hardCap = 5000;               // תקרה קשיחה כדי לא לסרוק דיסק שלם
      const scanCap = 200000;             // גם חיפוש שלא מוצא כלום חייב להיעצר
      const results = [];
      let scanned = 0;
      let truncated = false;

      (function walk(dir, depth) {
        if (depth > maxDepth) return;
        if (results.length >= hardCap || scanned >= scanCap) { truncated = true; return; }
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const entry of entries) {
          if (results.length >= hardCap || scanned >= scanCap) { truncated = true; return; }
          const full = path.join(dir, entry.name);
          scanned++;

          // junction או symlink מדווח בנפרד. קודם הוא נפל לענף 'קובץ' ו-statSync
          // הלך אחרי הקישור, כך שהתשובה הציגה קיצור-דרך לתיקייה בחוץ כאילו הוא
          // קובץ רגיל בתוך התחום, עם הגודל והתאריך של היעד.
          if (entry.isSymbolicLink()) {
            if (!params.dirs_only && rx.test(entry.name)) {
              results.push({ path: full, type: 'link', size: null, modified: null });
            }
            continue;                     // לא יורדים דרך קישור - זה יוצא מהתחום
          }

          if (entry.isDirectory()) {
            if (params.dirs_only && rx.test(entry.name)) results.push({ path: full, type: 'directory' });
            walk(full, depth + 1);
          } else if (!params.dirs_only && rx.test(entry.name)) {
            let size = null, mtime = null;
            try { const st = fs.lstatSync(full); size = st.size; mtime = st.mtime.toISOString(); } catch (e) {}
            results.push({ path: full, type: 'file', size, modified: mtime });
          }
        }
      })(root, 0);

      // הגעה מדויקת לתקרה נספרה קודם כסריקה שלמה: הדחיפה ה-5000 סיימה את הלולאה
      // בלי להיכנס שוב לתנאי, ו-truncated נשאר false. התשובה נראתה סופית.
      if (results.length >= hardCap || scanned >= scanCap) truncated = true;

      const offset = Math.max(0, Number(params.offset) || 0);
      const limit = Math.min(Math.max(1, Number(params.limit) || 100), 500);
      const page = results.slice(offset, offset + limit);

      return {
        root,
        pattern,
        scanned,
        total: results.length,
        offset,
        limit,
        maxDepth,
        returned: page.length,
        hasMore: offset + page.length < results.length,
        truncated,
        items: page
      };
    }
  };
}

module.exports = { createFileActions };
