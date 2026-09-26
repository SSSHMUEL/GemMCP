/**
 * הורדה והתקנה כמשימה שאפשר לבטל.
 *
 * למה זה קיים כמשימה ולא כפעולה חד-פעמית: הורדה והתקנה הן הצירוף המסוכן
 * ביותר בכלי הזה - קובץ ממקור שאינו בשליטת המשתמש, שרץ על המחשב שלו. אם
 * משהו נראה לא בסדר באמצע, צריך שתהיה דרך לעצור ולנקות, ולא רק להצטער.
 *
 * לכן כל משימה זוכרת בדיוק אילו קבצים היא יצרה. ביטול הורג את התהליך אם
 * הוא עוד רץ, ומוחק את מה שהורד - כך שביטול מחזיר את המחשב למצב שלפני.
 */
const fs = require('fs');
const path = require('path');

const jobs = new Map();
let seq = 0;

// משימות ישנות מתנקות, אחרת המפה גדלה כל עוד השרת חי.
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS && job.status !== 'running') jobs.delete(id);
  }
}

function createJob(url) {
  pruneJobs();
  // מזהה נגזר ממונה ומזמן, בלי אקראיות: כך אפשר לשחזר ולנפות מהיומן.
  const id = `inst_${Date.now().toString(36)}_${++seq}`;
  const job = {
    id,
    url,
    files: [],          // כל מה שנוצר על הדיסק, לצורך ביטול
    dirs: [],
    status: 'downloading',
    child: null,
    controller: new AbortController(),
    createdAt: Date.now(),
    error: null
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(String(id || ''));
}

function listJobs() {
  pruneJobs();
  return [...jobs.values()].map((j) => ({
    id: j.id, url: j.url, status: j.status, files: j.files.length, createdAt: j.createdAt
  }));
}

/**
 * ביטול: עוצר את מה שרץ, ומוחק את מה שנוצר.
 * מחיקה קשה ולא לסל המיחזור - הקובץ הזה מעולם לא היה של המשתמש, הוא ירד
 * לפני רגע ממקור חיצוני, ואין סיבה להשאיר אותו במחשב אחרי שביקש לבטל.
 */
function cancelJob(id) {
  const job = getJob(id);
  if (!job) return { found: false };

  job.status = 'cancelled';
  try { job.controller.abort(); } catch (e) { /* כבר הסתיים */ }
  if (job.child) {
    try { job.child.kill(); } catch (e) { /* כבר מת */ }
  }

  const removed = [];
  const failed = [];
  for (const f of job.files) {
    try {
      if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); removed.push(f); }
    } catch (e) { failed.push({ path: f, error: e.message }); }
  }
  // התיקיות נמחקות אחרי הקבצים, ורק אם התרוקנו - כדי לא למחוק בטעות
  // תיקייה שהמשתמש הוסיף אליה משהו משלו בינתיים.
  for (const d of [...job.dirs].reverse()) {
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); removed.push(d); }
    } catch (e) { failed.push({ path: d, error: e.message }); }
  }

  return { found: true, id: job.id, removed, failed };
}

module.exports = { createJob, getJob, listJobs, cancelJob };
