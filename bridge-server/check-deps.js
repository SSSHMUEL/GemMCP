'use strict';

/**
 * בדיקה מהירה שכל התלויות המוצהרות באמת מותקנות.
 *
 * למה לא `npm ls`: הוא עושה בדיוק את זה, אבל נמדד כאן ב-8 שניות. הבדיקה
 * הזו רצה לפני הפעלת הגשר, והתוסף מחכה לו - כלומר שמונה שניות של npm הפכו
 * את ההפעלה האוטומטית לכושלת, והמשתמש נשאר עם "צריך להפעיל את השרת ידנית".
 *
 * מה שבאמת צריך להיבדק הוא לא "האם node_modules קיימת" - היא קיימת גם אחרי
 * עדכון שהוסיף תלות חדשה, וזה בדיוק המקרה שבו השרת מת עם "Cannot find
 * module" בחלון נסתר שאיש לא רואה. לכן נבדקת כל תלות מוצהרת בנפרד.
 *
 * יציאה 0 = הכל קיים. יציאה 1 = חסר משהו, ומה שחסר מודפס.
 */

const fs = require('fs');
const path = require('path');

const HERE = __dirname;

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
} catch (e) {
  console.error('package.json לא נקרא: ' + e.message);
  process.exit(1);
}

const deps = Object.keys(pkg.dependencies || {});
if (!deps.length) process.exit(0);

const missing = [];
for (const name of deps) {
  // שם עם מרחב שמות (@scope/name) הוא נתיב בן שני מקטעים תחת node_modules.
  const dir = path.join(HERE, 'node_modules', ...name.split('/'));
  if (!fs.existsSync(path.join(dir, 'package.json'))) missing.push(name);
}

if (missing.length) {
  console.error('חסרות תלויות: ' + missing.join(', '));
  process.exit(1);
}
process.exit(0);
