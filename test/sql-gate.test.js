/**
 * בדיקות לשער ה-SQL שב-background.js.
 * הפונקציה טהורה, ולכן נשלפת מהמקור ונבדקת בלי דפדפן.
 *   node test/sql-gate.test.js
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function extract(name) {
  const start = source.indexOf('function ' + name);
  if (start === -1) throw new Error('not found: ' + name);
  let depth = 0, i = source.indexOf('{', start);
  const from = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, i + 1);
}

const consts = source.slice(source.indexOf('const SQL_READ_ONLY_STARTS'), source.indexOf('function assertSafeSql'));
const assertSafeSql = new Function('config', 'query',
  consts + '\n' + extract('assertSafeSql') + '\nreturn assertSafeSql(query, config);');

let pass = 0, fail = 0; const failures = [];
function check(name, fn, shouldThrow) {
  let threw = false, msg = '';
  try { fn(); } catch (e) { threw = true; msg = e.message; }
  const ok = threw === shouldThrow;
  if (ok) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; failures.push(name); console.log('  [FAIL] ' + name + (threw ? '  threw: ' + msg : '  did not throw')); }
}

const readOnly = { supabaseAllowWrites: false };
const writes   = { supabaseAllowWrites: true };
const allow = (q, c) => () => assertSafeSql(c || readOnly, q);

console.log('\n=== read-only queries must pass ===');
check('simple SELECT',        allow('SELECT * FROM users'), false);
check('CTE with WITH',        allow('WITH t AS (SELECT 1) SELECT * FROM t'), false);
check('parenthesised SELECT', allow('(SELECT 1)'), false);
check('EXPLAIN',              allow('EXPLAIN SELECT 1'), false);
check('SHOW',                 allow('SHOW search_path'), false);
check('keyword inside a string literal',
      allow("SELECT * FROM logs WHERE msg = 'user did DROP TABLE'"), false);

console.log('\n=== writes blocked by default ===');
check('INSERT blocked',  allow('INSERT INTO t VALUES (1)'), true);
check('UPDATE blocked',  allow('UPDATE t SET a = 1'), true);
check('DELETE blocked',  allow('DELETE FROM t'), true);
check('INSERT allowed when opted in', allow('INSERT INTO t VALUES (1)', writes), false);

console.log('\n=== always blocked, even with writes enabled ===');
check('DROP TABLE',   allow('DROP TABLE users', writes), true);
check('TRUNCATE',     allow('TRUNCATE users', writes), true);
check('GRANT',        allow('GRANT ALL ON t TO x', writes), true);
check('auth.users',   allow('SELECT * FROM auth.users', writes), true);
check('exec_sql recursion', allow('SELECT exec_sql(\'DROP TABLE t\')', writes), true);

console.log('\n=== evasion attempts ===');
check('comment hiding a second statement',
      allow('SELECT 1; --x\nDROP TABLE t', writes), true);
check('multi-statement',
      allow('SELECT 1; DELETE FROM t', writes), true);
check('block comment splitting a keyword is still caught',
      allow('SELECT 1; /* hi */ TRUNCATE t', writes), true);

console.log('\n=== malformed input ===');
check('empty query', allow(''), true);

console.log('\n' + '='.repeat(48));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\n  failures:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('='.repeat(48) + '\n');
process.exit(fail ? 1 : 0);
