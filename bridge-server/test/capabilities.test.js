/**
 * בדיקות ליכולות שנוספו: פעולות קבצים, עימוד, והרצת תוכניות.
 * מריצים מול שרת חי:  npm run test:caps
 *
 * הבדיקות עובדות בתוך תיקיית עבודה זמנית מתחת לשולחן העבודה, כדי להישאר
 * בתוך תקרת WIN_ALLOWED_PATH ולא לגעת בקבצים אמיתיים.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';
const HOME = process.env.USERPROFILE || process.env.HOME;
// נגזר מהשרת בזמן ריצה, ראה למטה
let DESKTOP = path.join(HOME, 'Desktop');
let WORK = path.join(DESKTOP, '_gemmcp_test');

let TOKEN = '';
try { TOKEN = fs.readFileSync(path.join(__dirname, '..', '.token'), 'utf8').trim(); } catch (e) {}

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

async function postOnce(pathname, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['x-bridge-token'] = TOKEN;
  const res = await fetch(BASE + pathname, { method: 'POST', headers, body: JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

const post = (pathname, body) => withRateLimitRetry(() => postOnce(pathname, body));
const run = (action, params) => post('/api/windows/execute', { action, params });
const plan = (steps) => post('/api/windows/plan', { plan: steps });

(async () => {
  const pre = await (await fetch(BASE + '/api/health')).json();
  if (pre.permissions && pre.permissions.allowedPath && pre.permissions.allowedPath !== '*') {
    DESKTOP = pre.permissions.allowedPath;
    WORK = path.join(DESKTOP, '_gemmcp_test');
  }

  // ---- הפרדה בין תחום קריאה לתחום כתיבה ----
  console.log('');
  console.log('=== read scope is separate from write scope ===');

  // קודם נתיב אחד שלט בשניהם, ולכן כדי לקרוא קובץ מ-Downloads היה צריך
  // לפתוח את Downloads גם למחיקה. קריאה הפיכה, מחיקה לא.
  const wide = { readScope: 'everything', writeFiles: true };
  // לא קובץ מערכת: אלה חסומים תמיד. קובץ של המשתמש מחוץ לתחום הכתיבה.
  const outsideFile = path.join(process.env.USERPROFILE || '', 'Downloads');

  const readWide = await post('/api/windows/execute',
    { action: 'list_directory', params: { path: outsideFile }, permissions: wide });
  check('with a wide read scope, a folder outside the write path is readable',
        readWide.json.success === true, readWide.json.error);

  const readNarrow = await post('/api/windows/execute',
    { action: 'list_directory', params: { path: outsideFile }, permissions: { readScope: 'desktop' } });
  check('with the narrow read scope, the same folder is refused',
        readNarrow.json.success === false);

  // זה הלב: היקף קריאה רחב אינו פותח כתיבה.
  const writeWide = await post('/api/windows/execute',
    { action: 'write_file',
      params: { path: path.join(process.env.USERPROFILE || '', 'Downloads', '_scope_probe.txt'), content: 'x' },
      permissions: wide });
  check('a wide read scope does NOT open writing outside the allowed path',
        writeWide.json.success === false, writeWide.json.error);

  const writeInside = await post('/api/windows/execute',
    { action: 'write_file', params: { path: path.join(WORK, 'inside.txt'), content: 'x' }, permissions: wide });
  check('writing inside the allowed path still works', writeInside.json.success === true, writeInside.json.error);

  // ניקוי מצב קודם והכנת סביבת עבודה
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, 'alpha.txt'), 'alpha contents');
  fs.writeFileSync(path.join(WORK, 'beta.txt'), 'beta contents');
  fs.writeFileSync(path.join(WORK, 'notes.md'), 'markdown');

  const health = (await (await fetch(BASE + '/api/health')).json());
  const canWrite = health.permissions && health.permissions.writeFiles;

  console.log('');
  console.log('=== pagination ===');
  const ls = await run('list_directory', { path: WORK, limit: 2 });
  check('list_directory reports total and hasMore',
        ls.json.data.total === 3 && ls.json.data.returned === 2 && ls.json.data.hasMore === true,
        JSON.stringify({ total: ls.json.data.total, returned: ls.json.data.returned, hasMore: ls.json.data.hasMore }));
  const ls2 = await run('list_directory', { path: WORK, offset: 2, limit: 2 });
  check('list_directory second page completes the set',
        ls2.json.data.returned === 1 && ls2.json.data.hasMore === false);

  const rf = await run('read_file', { path: path.join(WORK, 'alpha.txt'), limit: 5 });
  check('read_file honours a read window',
        rf.json.data.content === 'alpha' && rf.json.data.hasMore === true,
        JSON.stringify(rf.json.data.content));
  const rf2 = await run('read_file', { path: path.join(WORK, 'alpha.txt'), offset: 5, limit: 100 });
  check('read_file second window reaches the end',
        rf2.json.data.content === ' contents' && rf2.json.data.hasMore === false);

  console.log('');
  console.log('=== find_files ===');
  const ff = await run('find_files', { path: WORK, pattern: '*.txt' });
  check('find_files matches a glob', ff.json.data.total === 2, 'total=' + (ff.json.data && ff.json.data.total));
  const ffPage = await run('find_files', { path: WORK, pattern: '*', limit: 1 });
  check('find_files paginates', ffPage.json.data.returned === 1 && ffPage.json.data.hasMore === true);
  const ffOut = await run('find_files', { path: 'C:/Windows', pattern: '*.exe' });
  check('find_files respects the path ceiling', !(ffOut.json && ffOut.json.success), 'status ' + ffOut.status);

  console.log('');
  console.log('=== file mutations (' + (canWrite ? 'writes enabled' : 'writes disabled - expecting 403') + ') ===');
  const mk = await run('make_dir', { path: path.join(WORK, 'sub') });
  const cp = await run('copy_file', { from: path.join(WORK, 'alpha.txt'), to: path.join(WORK, 'sub') });
  const mv = await run('move_file', { from: path.join(WORK, 'beta.txt'), to: path.join(WORK, 'sub') });

  if (canWrite) {
    check('make_dir creates a directory', mk.json.success === true && fs.existsSync(path.join(WORK, 'sub')));
    check('copy_file copies into a directory target',
          cp.json.success === true && fs.existsSync(path.join(WORK, 'sub', 'alpha.txt')));
    check('copy_file leaves the source in place', fs.existsSync(path.join(WORK, 'alpha.txt')));
    check('move_file moves and removes the source',
          mv.json.success === true &&
          fs.existsSync(path.join(WORK, 'sub', 'beta.txt')) &&
          !fs.existsSync(path.join(WORK, 'beta.txt')));
    const clash = await run('copy_file', { from: path.join(WORK, 'alpha.txt'), to: path.join(WORK, 'sub', 'alpha.txt') });
    check('copy_file refuses to overwrite without overwrite=true', clash.status === 409, 'got ' + clash.status);
  } else {
    check('make_dir is gated by writeFiles', mk.status === 403);
    check('copy_file is gated by writeFiles', cp.status === 403);
    check('move_file is gated by writeFiles', mv.status === 403);
  }

  const escape = await run('copy_file', { from: path.join(WORK, 'alpha.txt'), to: 'C:/Windows/evil.txt' });
  check('copy_file cannot write outside the ceiling', !(escape.json && escape.json.success), 'status ' + escape.status);

  console.log('');
  console.log('=== hostile input (findings from the adversarial review) ===');

  // רצף כוכביות תרגם ל-'.*.*.*' וגרם ל-backtracking קטסטרופלי שהקפיא את הגשר
  const t0 = Date.now();
  const redos = await run('find_files', { path: WORK, pattern: '*'.repeat(40) + 'x' });
  const elapsed = Date.now() - t0;
  check('a pathological glob does not hang the bridge', elapsed < 3000, elapsed + 'ms');
  check('the bridge is still responsive afterwards',
        (await (await fetch(BASE + '/api/health')).json()).status === 'ok');

  // הפניות שנפתרו דרך שרשרת הפרוטוטייפ שלפו אובייקטים והכניסו אותם לפרמטרים
  const protoRef = await plan([
    { action: 'list_directory', path: WORK, as: 'listing' },
    { action: 'read_file', path: '$listing.constructor' }
  ]);
  check('a $constructor reference cannot pull a host object into a parameter',
        protoRef.json.success === false, JSON.stringify(protoRef.json && protoRef.json.error));

  const protoAlias = await plan([{ action: 'list_directory', path: WORK, as: '__proto__' }]);
  check('an alias named __proto__ is rejected outright',
        protoAlias.status === 400, 'got ' + protoAlias.status);

  console.log('');
  console.log('=== plans ===');
  const empty = await plan([]);
  check('empty plan is rejected', empty.status === 400);

  const tooLong = await plan(Array.from({ length: 50 }, () => ({ action: 'list_directory', path: WORK })));
  check('over-long plan is rejected', tooLong.status === 400, 'got ' + tooLong.status);

  const seq = await plan([
    { action: 'list_directory', path: WORK, as: 'listing' },
    { action: 'read_file', path: path.join(WORK, 'notes.md'), as: 'note' }
  ]);
  check('multi-step plan runs every step',
        seq.json.success === true && seq.json.data.completed === 2,
        JSON.stringify(seq.json && seq.json.error));
  check('plan keeps each step result under its alias',
        seq.json.data.results.listing && seq.json.data.results.note &&
        seq.json.data.results.note.content === 'markdown');

  // הפניה בין שלבים: התוצאה של שלב אחד מזינה את הבא
  const ref = await plan([
    { action: 'find_files', path: WORK, pattern: '*.md', as: 'found' },
    { action: 'read_file', path: '$found.items[0].path', as: 'body' }
  ]);
  check('plan passes a value from one step into the next',
        ref.json.success === true && ref.json.data.results.body.content === 'markdown',
        JSON.stringify(ref.json && (ref.json.error || ref.json.data.results.body)));

  const halt = await plan([
    { action: 'list_directory', path: WORK, as: 'ok' },
    { action: 'read_file', path: path.join(WORK, 'does-not-exist.txt') },
    { action: 'list_directory', path: WORK }
  ]);
  check('plan stops at the first failing step',
        halt.json.success === false && halt.json.partial && halt.json.partial.completed === 1,
        JSON.stringify(halt.json && halt.json.partial && halt.json.partial.completed));
  check('failed plan reports which step broke',
        halt.json.partial.log.length === 2 && halt.json.partial.log[1].ok === false);

  const planEscape = await plan([{ action: 'list_directory', path: 'C:/Windows' }]);
  check('plan steps obey the same path ceiling', planEscape.json.success === false);

  // בריחה מהתחום דרך junction. אומת בפועל לפני התיקון: junction בתוך התחום
  // המותר, ונתיב יעד עם שני מקטעים חסרים או יותר, גרם ל-canonicalise לוותר על
  // הפענוח - הבדיקה עברה והקובץ נכתב מחוץ לתקרה.
  const outside = path.join(require('os').tmpdir(), '_gemmcp_outside_' + process.pid);
  const link = path.join(WORK, 'link');
  let junctionMade = false;
  try {
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, link, 'junction');
    junctionMade = fs.existsSync(link);
  } catch (e) { /* יצירת junction עשויה לדרוש הרשאה - מדלגים */ }

  if (junctionMade) {
    for (const depth of ['escape.txt', 'a/escape.txt', 'a/b/c/escape.txt']) {
      const res = await run('write_file', { path: path.join(link, depth), content: 'ESCAPED' });
      check('junction escape blocked (' + depth + ')', res.json.success === false);
    }
    const leaked = fs.existsSync(outside) &&
      fs.readdirSync(outside, { recursive: true }).some((f) => String(f).endsWith('escape.txt'));
    check('nothing was written outside the ceiling', leaked === false);
    try { fs.unlinkSync(link); } catch (e) { try { fs.rmdirSync(link); } catch (e2) {} }
  } else {
    console.log('  [skip] junction escape - לא ניתן ליצור junction בסביבה הזו');
  }
  fs.rmSync(outside, { recursive: true, force: true });

  // ---- הקשחת תוכניות ----
  console.log('');
  console.log('=== plan hardening ===');

  // הפניה בתוך run_command: הטקסט שמאושר אינו הטקסט שרץ. שם קובץ הוא קלט
  // שאפשר לשתול, ולכן זה ערוץ הזרקה לתוך מחרוזת PowerShell.
  const refInCmd = await plan([
    { action: 'find_files', pattern: '*.txt', as: 'f' },
    { action: 'run_command', command: 'Get-Item $f.items[0].path' }
  ]);
  check('reference inside run_command is refused',
        refInCmd.json.success === false && /run_command/.test(refInCmd.json.error || ''));
  check('the refusal happens before any step runs',
        !refInCmd.json.partial || refInCmd.json.partial.completed === 0);

  // הפניה שלא נפתרה עצרה קודם להיות טקסט גולמי, והתוכנית המשיכה על נתיב מומצא
  const badRef = await plan([
    { action: 'list_directory', path: WORK, as: 'd' },
    { action: 'make_dir', path: '$nosuch[0].path' }
  ]);
  check('an unresolved reference aborts instead of becoming literal text',
        badRef.json.success === false && /הפניה/.test(badRef.json.error || ''));
  check('no directory named after the raw reference was created',
        fs.existsSync(path.join(WORK, '$nosuch[0].path')) === false);

  // שרשור תקין חייב להמשיך לעבוד - ההקשחה לא אמורה לשבור את התכונה עצמה
  const goodChain = await plan([
    { action: 'make_dir', path: path.join(WORK, 'chain'), as: 'made' },
    { action: 'write_file', path: '$made.path/note.txt', content: 'ok' }
  ]);
  check('valid chaining still works',
        goodChain.json.success === true && goodChain.json.data.completed === 2,
        goodChain.json.error);

  // ---- find_files ----
  console.log('');
  console.log('=== find_files limits ===');

  const deep = await run('find_files', { path: WORK, pattern: '*', max_depth: 999999 });
  check('max_depth is clamped rather than trusted',
        deep.json.success === true && deep.json.data.maxDepth <= 24,
        String(deep.json.data && deep.json.data.maxDepth));

  const neg = await run('find_files', { path: WORK, pattern: '*', max_depth: -5 });
  check('a negative max_depth does not go negative',
        neg.json.success === true && neg.json.data.maxDepth >= 0);

  // ---- delete_file ----
  console.log('');
  console.log('=== delete_file scope ===');

  const full = path.join(WORK, 'notempty');
  fs.mkdirSync(path.join(full, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(full, 'sub', 'a.txt'), 'x');
  const delDir = await run('delete_file', { path: full });
  check('deleting a non-empty directory needs an explicit flag',
        delDir.json.success === false && /recursive/.test(delDir.json.error || ''));
  check('the directory survived the refused delete', fs.existsSync(full));
  check('the refusal says how many items are at stake',
        /\d+\s*פריטים/.test(delDir.json.error || ''), delDir.json.error);

  // ---- הרחבת ~ לתיקיות המערכת האמיתיות ----
  console.log('');
  console.log('=== tilde paths ===');

  // אומת מקצה לקצה מול ג'מיני: המודל שלח '~/Desktop', זה נפתר ל-
  // os.homedir()+'/Desktop' - תיקייה שאינה שולחן העבודה שהמשתמש רואה כשהוא
  // מופנה ל-OneDrive - והבקשה נחסמה כחריגה מהתחום. כלומר התכונה המרכזית של
  // הכלי לא עבדה בכלל במחשב עם OneDrive.
  const desktopIsCeiling = path.basename(DESKTOP).toLowerCase() === 'desktop';
  if (desktopIsCeiling) {
    const tilde = await run('list_directory', { path: '~/Desktop' });
    check('~/Desktop resolves to the real desktop, not the home folder',
          tilde.json.success === true, tilde.json.error);

    const tildeBack = await run('list_directory', { path: '~' + String.fromCharCode(92) + 'Desktop' });
    check('the backslash form resolves too', tildeBack.json.success === true, tildeBack.json.error);

    const nested = await run('list_directory', { path: '~/Desktop/_gemmcp_test' });
    check('a nested path under ~ keeps its tail', nested.json.success === true, nested.json.error);
  } else {
    console.log('  [skip] tilde paths - התקרה אינה שולחן העבודה');
  }

  // ~ עדיין אינו מפתח דלת: תיקיות מחוץ לתקרה נחסמות כרגיל
  const outsideTilde = await run('list_directory', { path: '~/AppData' });
  check('~ does not bypass the ceiling', outsideTilde.json.success === false);


  // ניקוי
  fs.rmSync(WORK, { recursive: true, force: true });

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



