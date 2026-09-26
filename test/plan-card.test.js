/**
 * בדיקות ללוגיקת כרטיס האישור של תוכניות, ב-content.js.
 * הפונקציות טהורות, ולכן נשלפות מהמקור ונבדקות בלי דפדפן.
 *   node test/plan-card.test.js
 *
 * מה שנבדק כאן הוא בדיוק מה שמגן על המשתמש: שדרגת הסיכון של תוכנית היא של
 * השלב המסוכן ביותר שבה, ושתוכנית לעולם לא רצה בלי אישור.
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function extractBlock(startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('not found: ' + startMarker);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, i + 1);
}

// ACTION_RISK is an object literal; grab it plus the helpers that read it
const riskStart = source.indexOf('const ACTION_RISK = {');
const riskEnd = source.indexOf('};', riskStart) + 2;
const ACTION_RISK_SRC = source.slice(riskStart, riskEnd);

const sandbox = ACTION_RISK_SRC + '\n' +
  extractBlock('const PLAN_RISK_ORDER') .replace(/^const PLAN_RISK_ORDER/, 'const PLAN_RISK_ORDER') + ';\n' +
  extractBlock('function classifyAction') + '\n' +
  extractBlock('function describePlan') + '\n' +
  extractBlock('function describeAction') + '\n' +
  extractBlock('function requiresExplicitApproval') + '\n' +
  'return { classifyAction, describePlan, describeAction, requiresExplicitApproval };';

let api;
try {
  api = new Function(sandbox)();
} catch (e) {
  // PLAN_RISK_ORDER is a plain const, extractBlock may mis-slice it; fall back
  const orderMatch = source.match(/const PLAN_RISK_ORDER = \{[^}]*\};/);
  const alt = ACTION_RISK_SRC + '\n' + (orderMatch ? orderMatch[0] : '') + '\n' +
    extractBlock('function classifyAction') + '\n' +
    extractBlock('function describePlan') + '\n' +
    extractBlock('function describeAction') + '\n' +
    extractBlock('function requiresExplicitApproval') + '\n' +
    'return { classifyAction, describePlan, describeAction, requiresExplicitApproval };';
  api = new Function(alt)();
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push(name); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

const { classifyAction, describePlan, describeAction, requiresExplicitApproval } = api;

console.log('');
console.log('=== single action risk tiers ===');
check('read_file is safe', classifyAction({ action: 'read_file' }).level === 'safe');
check('open_app is safe', classifyAction({ action: 'open_app' }).level === 'safe');
check('copy_file is a change', classifyAction({ action: 'copy_file' }).level === 'warn');
check('move_file is dangerous', classifyAction({ action: 'move_file' }).level === 'danger');
check('delete_file is dangerous', classifyAction({ action: 'delete_file' }).level === 'danger');
check('run_command is dangerous', classifyAction({ action: 'run_command' }).level === 'danger');
check('an unknown action is not treated as safe',
      classifyAction({ action: 'something_new' }).level !== 'safe');

console.log('');
console.log('=== a plan takes the tier of its worst step ===');
check('all-safe plan stays safe',
      classifyAction({ plan: [{ action: 'read_file' }, { action: 'list_directory' }] }).level === 'safe');
check('one change step raises the plan to change',
      classifyAction({ plan: [{ action: 'read_file' }, { action: 'copy_file' }] }).level === 'warn');
check('one dangerous step buried in safe steps raises the whole plan',
      classifyAction({
        plan: [{ action: 'read_file' }, { action: 'list_directory' },
               { action: 'delete_file' }, { action: 'read_file' }]
      }).level === 'danger',
      'this is the case that stops a destructive step hiding in a routine list');
check('plan label states the step count',
      classifyAction({ plan: [{ action: 'read_file' }, { action: 'read_file' }] }).label.indexOf('2') !== -1);

console.log('');
console.log('=== approval policy ===');
check('a dangerous single action always needs approval',
      requiresExplicitApproval('windows', { action: 'run_command' }) === true);
check('a safe single action may auto-run',
      requiresExplicitApproval('windows', { action: 'read_file' }) === false);
check('an all-safe plan STILL needs approval',
      requiresExplicitApproval('windows', { plan: [{ action: 'read_file' }] }) === true,
      'a plan runs several actions in sequence - the user must see it first');

// דרג 'שינוי' עבר קודם אוטומטית, כי הסף היה 'danger' בלבד. כלומר copy_file
// כתב לדיסק ו-create_repo יצר מאגר ציבורי בלי לשאול, כשהרצה אוטומטית דלוקה.
check('a change-tier local action needs approval',
      requiresExplicitApproval('windows', { action: 'copy_file' }) === true);
check('creating a directory needs approval',
      requiresExplicitApproval('windows', { action: 'make_dir' }) === true);
check('an outward-facing create needs approval',
      requiresExplicitApproval('github', { action: 'create_repo' }) === true);
check('opening a public issue needs approval',
      requiresExplicitApproval('github', { action: 'create_issue' }) === true);
check('an unknown action is never auto-run',
      requiresExplicitApproval('windows', { action: 'something_new' }) === true);
check('read-only actions still auto-run',
      requiresExplicitApproval('windows', { action: 'list_directory' }) === false &&
      requiresExplicitApproval('supabase', { action: 'list_tables' }) === false);

// שני מצבי ההרצה האוטומטית. הפונקציה קוראת את autoRunScope מהסביבה, ולכן
// אפשר להחליף מצב ולבדוק שהמדיניות באמת משתנה - ובעיקר שהדרג המסוכן
// והתוכניות אינם מושפעים משום מצב.
console.log('');
console.log('=== the two auto-run scopes ===');

globalThis.autoRunScope = 'read';
check('safe mode: a change-tier action asks',
      requiresExplicitApproval('windows', { action: 'copy_file' }) === true);
check('safe mode: a read still runs on its own',
      requiresExplicitApproval('windows', { action: 'read_file' }) === false);

globalThis.autoRunScope = 'all';
// מצב אוטונומי לפי בקשה מפורשת: שום דבר אינו נעצר לאישור. מה שממשיך להגן
// אינו הכרטיס אלא השרת - תקרת ההרשאות ותיחום הנתיב, שנבדקים בחבילות האחרות
// ואינם מושפעים מהמצב הזה.
check('autonomous: a change-tier action runs on its own',
      requiresExplicitApproval('windows', { action: 'copy_file' }) === false);
check('autonomous: running a command does not stop to ask',
      requiresExplicitApproval('windows', { action: 'run_command' }) === false);
check('autonomous: deleting does not stop to ask',
      requiresExplicitApproval('windows', { action: 'delete_file' }) === false);
check('autonomous: a multi-step plan runs too',
      requiresExplicitApproval('windows', { plan: [{ action: 'delete_file' }] }) === false);
check('autonomous: an unknown action runs too',
      requiresExplicitApproval('windows', { action: 'something_new' }) === false);

// הורדה והתקנה מסומנת alwaysAsk. זו הפעולה היחידה שגוברת על המצב שנבחר,
// כי היא מריצה קובץ ממקור שאינו בשליטת המשתמש. אם מישהו יסיר את הדגל
// בטעות, הבדיקה הזו תיפול.
check('autonomous: install_from_url STILL asks',
      requiresExplicitApproval('windows', { action: 'install_from_url' }) === true);
check('autonomous: a plain download does not ask',
      requiresExplicitApproval('windows', { action: 'download_file' }) === false);
check('safe mode: install_from_url asks too',
      (globalThis.autoRunScope = 'read',
       requiresExplicitApproval('windows', { action: 'install_from_url' })) === true);
globalThis.autoRunScope = 'all';
globalThis.autoRunScope = 'read';   // מחזירים לברירת המחדל

console.log('');
console.log('=== human-readable descriptions ===');
check('run_command names the shell',
      describeAction('windows', { action: 'run_command', command: 'Get-Date' }).indexOf('PowerShell') !== -1);
check('delete_file says recycle bin',
      describeAction('windows', { action: 'delete_file', path: 'C:/x.txt' }).indexOf('סל המיחזור') !== -1);
check('move_file names both ends',
      describeAction('windows', { action: 'move_file', from: 'a.txt', to: 'b/' }).indexOf('a.txt') !== -1);

const listing = describePlan('windows', {
  plan: [{ action: 'find_files', path: '~/D', pattern: '*.pdf' }, { action: 'delete_file', path: 'x' }]
});
check('plan description numbers every step',
      listing.indexOf('1.') !== -1 && listing.indexOf('2.') !== -1);
check('plan description covers every step, none hidden',
      listing.split('\n').length === 2, listing.split('\n').length + ' lines');

console.log('');
console.log('================================================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(''); failures.forEach(f => console.log('   - ' + f)); }
console.log('================================================');
console.log('');
process.exit(fail ? 1 : 0);

