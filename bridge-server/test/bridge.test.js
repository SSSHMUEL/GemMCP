/**
 * מערכת בדיקות רגרסיה לגשר GemMCP.
 * מריצים מול שרת חי:  npm test
 *
 * כל בדיקה מתעדת התנהגות שנשברה בעבר, או הגנה שנוספה בעקבות ממצא.
 * נתיבים נכתבים עם לוכסן קדימה בכוונה - Node מנרמל אותם ב-Windows.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';
const HOME = process.env.USERPROFILE || process.env.HOME;
// התיקייה לבדיקה נגזרת מהתקרה שהשרת מדווח, לא מהנחה על מיקום שולחן העבודה.
// ב-Windows עם OneDrive שולחן העבודה האמיתי אינו ~/Desktop.
let DESKTOP = path.join(HOME, 'Desktop');

// האימות אופציונלי: פעיל רק אם BRIDGE_AUTH_TOKEN מוגדר ב-.env. הבדיקות
// מתאימות את עצמן למצב בפועל במקום להניח אחד מהם.
let TOKEN = '';
try {
  TOKEN = fs.readFileSync(path.join(__dirname, '..', '.token'), 'utf8').trim();
} catch (e) { /* אין קובץ טוקן - מצב ללא אימות */ }

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push({ name, detail }); console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}


// החבילה עצמה מייצרת יותר מ-40 בקשות בחלון של 10 שניות, ולכן חוטפת 429 מהלימיטר
// האמיתי. במקום להחליש את ההגנה לצורך הבדיקות, מחכים ומנסים שוב - כך הלימיטר
// נשאר בתוקף גם בזמן שהבדיקות רצות.
async function withRateLimitRetry(fn) {
  let out = await fn();
  if (out && out.status === 429) {
    await new Promise((r) => setTimeout(r, 10500));
    out = await fn();
  }
  return out;
}

async function callOnce(body, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token !== null && TOKEN) headers['x-bridge-token'] = opts.token || TOKEN;
  if (opts.token && opts.token !== null) headers['x-bridge-token'] = opts.token;
  if (opts.protocol) headers['x-gemmcp-protocol'] = String(opts.protocol);
  const res = await fetch(BASE + (opts.path || '/api/windows/execute'), {
    method: opts.method || 'POST',
    headers: headers,
    body: opts.method === 'GET' ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* לא JSON */ }
  return { status: res.status, json: json };
}

const call = (body, opts) => withRateLimitRetry(() => callOnce(body, opts));

function dir(p, permissions) {
  const o = { action: 'list_directory', params: { path: p } };
  if (permissions) o.permissions = permissions;
  return o;
}

(async () => {
  const health = (await call(null, { path: '/api/health', method: 'GET' })).json || {};
  const authOn = !!health.authRequired;
  if (health.permissions && health.permissions.allowedPath && health.permissions.allowedPath !== '*') {
    DESKTOP = health.permissions.allowedPath;
  }

  console.log('');
  console.log('=== authentication: ' + (authOn ? 'token enforced' : 'token opt-in, currently off') + ' ===');
  check('health is reachable', (await call(null, { path: '/api/health', method: 'GET' })).status === 200);
  if (authOn) {
    check('no token is rejected', (await call(dir(DESKTOP), { token: null })).status === 401);
    check('wrong token is rejected', (await call(dir(DESKTOP), { token: 'nope' })).status === 401);
    check('correct token is accepted', (await call(dir(DESKTOP))).json.success === true);
  } else {
    check('requests work without a token', (await call(dir(DESKTOP))).json.success === true);
  }

  console.log('');
  console.log('=== protocol handshake ===');
  check('matching protocol passes', (await call(dir(DESKTOP), { protocol: 1 })).json.success === true);
  if (authOn) {
    check('mismatched protocol 409s', (await call(dir(DESKTOP), { protocol: 99 })).status === 409);
  }

  console.log('');
  console.log('=== permission ceiling: .env must win over the client ===');
  // הבדיקה נגזרת מהתקרה בפועל ולא מניחה אותה: מה שכבוי בשרת חייב להישאר כבוי
  // גם כשהלקוח מבקש אותו במפורש.
  const ceiling = health.permissions || {};

  if (ceiling.runCommands === false) {
    const esc = await call({ action: 'run_command', params: { command: 'whoami' }, permissions: { runCommands: true } });
    check('client cannot grant itself runCommands', esc.status === 403, 'got ' + esc.status);
  } else {
    console.log('  [skip] runCommands is enabled in .env - nothing to escalate');
  }

  if (ceiling.writeFiles === false) {
    const escW = await call({ action: 'write_file', params: { path: DESKTOP + '/_gemmcp_probe.txt', content: 'x' }, permissions: { writeFiles: true } });
    check('client cannot grant itself writeFiles', escW.status === 403, 'got ' + escW.status);
  } else {
    console.log('  [skip] writeFiles is enabled in .env - nothing to escalate');
  }
  const escP = await call(dir('C:/Windows/System32', { readFiles: true, allowedPath: 'C:/' }));
  check('client cannot widen allowedPath', !(escP.json && escP.json.success), 'got ' + escP.status);
  const narrow = await call(dir(DESKTOP, { readFiles: false }));
  check('client CAN narrow its own permissions', narrow.status === 403, 'got ' + narrow.status);

  console.log('');
  console.log('=== path scope ===');
  check('inside allowed path works', (await call(dir(DESKTOP))).json.success === true);
  check('outside allowed path blocked', !(await call(dir('C:/Windows'))).json.success);
  check('traversal blocked', !(await call(dir(DESKTOP + '/../../../Windows'))).json.success);
  // גבול תחילית. נבדק על כתיבה ולא על קריאה: מאז שתחום הקריאה נפרד מתחום
  // הכתיבה, קריאה עשויה להיות רחבה בכוונה - אבל תיקייה אחות שרק חולקת
  // תחילית עם התחום המותר לעולם אינה חלק ממנו לצורך שינוי.
  const sibling = DESKTOP + 'Evil';
  fs.mkdirSync(sibling, { recursive: true });
  const sib = await call({
    action: 'write_file',
    params: { path: sibling + '/probe.txt', content: 'x' },
    permissions: { writeFiles: true, readScope: 'everything' }
  });
  check('a sibling dir sharing a prefix cannot be written to',
        !(sib.json && sib.json.success), 'got ' + sib.status);
  check('and nothing was actually written there',
        fs.existsSync(sibling + '/probe.txt') === false);
  fs.rmSync(sibling, { recursive: true, force: true });

  console.log('');
  console.log('=== open_app shell injection ===');
  const bad = ['calc & whoami', 'calc|whoami', 'calc;whoami', 'calc`whoami`'];
  for (const b of bad) {
    const r = await call({ action: 'open_app', params: { app_name: b } });
    check('rejects app_name: ' + b, r.status === 400, 'got ' + r.status);
  }
  check('rejects unknown app', (await call({ action: 'open_app', params: { app_name: 'zzz_nope_999' } })).status === 404);
  check('rejects uninstalled protocol', (await call({ action: 'open_app', params: { app_name: 'spotify' } })).status === 404);

  console.log('');
  console.log('=== error handling ===');
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['x-bridge-token'] = TOKEN;
  const raw = await fetch(BASE + '/api/windows/execute', { method: 'POST', headers: headers, body: '{bad' });
  const text = await raw.text();
  check('malformed JSON leaks no stack trace', text.indexOf('<!DOCTYPE') === -1 && text.indexOf('at Object') === -1, text.slice(0, 60));

  console.log('');
  console.log('=== audit log ===');
  const auditPath = path.join(__dirname, '..', 'audit.log');
  const before = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').length : 0;
  await call(dir(DESKTOP));
  await new Promise(r => setTimeout(r, 400));
  const after = fs.readFileSync(auditPath, 'utf8').length;
  check('executed action is appended to the audit log', after > before, before + ' -> ' + after);

  console.log('');
  console.log('================================================');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('');
    console.log('  failures:');
    failures.forEach(f => console.log('   - ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
  }
  console.log('================================================');
  console.log('');
  process.exit(fail ? 1 : 0);
})();
