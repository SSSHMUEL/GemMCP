const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

process.on('uncaughtException', (err) => {
  console.error('⚠️ [Bridge Server Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Bridge Server Unhandled Rejection]:', reason);
});

const app = express();
// פורט מאומת: מתעלם מערכים לא תקינים (0, ריק, לא מספר) כדי להבטיח שהשרת תמיד עולה על פורט אמיתי
const rawPort = Number(process.env.PORT);
const PORT = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 3000;
const HOST = '127.0.0.1'; // נעילת שרת ל-localhost בלבד למניעת חשיפה ברשת

// הגדרת CORS מאובטחת - מאשר רק את תוסף הכרום ו-Localhost
const corsOptions = {
  origin: (origin, callback) => {
    // בקשות ללא origin (כגון curl, background service worker) או מתוספי Chrome ומ-localhost
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    return callback(new Error('גישה נחסמה מטעמי אבטחה (CORS Policy). הבקשה אינה מגיעה מתוסף מאושר.'));
  }
};

app.use(cors(corsOptions));
app.use(express.json());

// אימות אופציונלי באמצעות Token משותף (אם הוגדר ב-.env)
app.use((req, res, next) => {
  const serverAuthToken = process.env.BRIDGE_AUTH_TOKEN;
  if (serverAuthToken) {
    const authHeader = req.headers['x-bridge-token'] || req.headers['authorization'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    if (token !== serverAuthToken) {
      return res.status(401).json({ success: false, error: 'אימות נכשל: BRIDGE_AUTH_TOKEN אינו תואם.' });
    }
  }
  next();
});

// מנגנון סינון בטיחות משופר לשאילתות SQL
function sanitizeAndCheckQuery(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('שאילתת SQL ריקה או לא תקינה');
  }

  const upper = query.trim().toUpperCase();

  // חסימת פקודות הרסניות, שינויי הרשאות וגישה לטבלאות רגישות
  const dangerousKeywords = [
    'DROP DATABASE',
    'DROP TABLE',
    'DROP VIEW',
    'DROP SCHEMA',
    'TRUNCATE',
    'ALTER SYSTEM',
    'GRANT',
    'REVOKE',
    'CREATE USER',
    'ALTER USER',
    'DROP USER',
    'AUTH.USERS',
    'PG_SHADOW',
    'PG_AUTHID'
  ];

  for (const kw of dangerousKeywords) {
    if (upper.includes(kw)) {
      throw new Error(`פעולה חסומה מטעמי בטיחות: שימוש ב-${kw} אינו מורשה.`);
    }
  }

  return query;
}

// Endpoint לביצוע פקודות SQL ישירות
app.post('/api/execute', async (req, res) => {
  try {
    const { query, config } = req.body;
    const safeQuery = sanitizeAndCheckQuery(query);

    const supabaseUrl = config?.supabaseUrl || process.env.SUPABASE_URL;
    const supabaseKey = config?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(400).json({
        success: false,
        error: 'חסרים פרטי התחברות ל-Supabase (SUPABASE_URL או SUPABASE_KEY ב-.env או בהגדרות התוסף)'
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ביצוע דרך RPC או שאילתת Postgres ישירה
    const { data, error } = await supabase.rpc('exec_sql', { query: safeQuery });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message || 'שגיאה בהרצת SQL',
        hint: 'אם פונקציית exec_sql לא קיימת ב-Supabase שלך, הרץ את הסקריפט מ-setup_rpc.sql ב-SQL Editor של Supabase'
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    console.error('Execution error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Callback לקבלת אישור ה-OAuth מ-Supabase
app.get('/oauth/callback', (req, res) => {
  const { code, error } = req.query;

  if (error) {
    // בזרימת שגיאה אין פרמטר code, ולכן התוסף לא מחליף את הלשונית —
    // זהו המסך היחיד שהמשתמש רואה, בעיצוב תואם לדף האישור של התוסף.
    const safeError = String(error).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);

    return res.send(`
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>שגיאת התחברות</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body {
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
            background: radial-gradient(120% 80% at 50% 0%, #1e293b 0%, #172033 45%, #0f172a 100%);
            background-color: #0f172a; color: #e2e8f0; padding: 20px;
          }
          .card {
            background: linear-gradient(160deg, #1e293b, #172033);
            border: 1px solid #334155; border-radius: 26px;
            padding: 42px 36px; max-width: 480px; width: 100%; text-align: center;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 20px 50px rgba(0, 0, 0, 0.45);
          }
          h1 { font-size: 25px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.2px; color: #f1f5f9; }
          p { font-size: 15px; color: #94a3b8; line-height: 1.55; }
          .badge {
            display: inline-flex; align-items: center; gap: 7px; margin-top: 24px;
            background: rgba(153, 27, 27, 0.25); color: #fca5a5; border: 1px solid rgba(220, 38, 38, 0.4);
            padding: 9px 20px; border-radius: 14px; font-size: 14px; font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ ההתחברות בוטלה או נכשלה</h1>
          <p>${safeError}</p>
          <div class="badge">שגיאת אימות</div>
        </div>
      </body>
      </html>
    `);
  }

  // דף ביניים שקוף ויזואלית: התוסף מחליף מיד את הלשונית ב-oauth-success.html.
  // הרקע זהה לדף האישור הכהה של התוסף כדי שהמעבר לא יורגש כמסך נוסף.
  res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>מתחבר...</title>
      <style>
        html, body { height: 100%; margin: 0; background: #0f172a; }
      </style>
    </head>
    <body></body>
    </html>
  `);
});

// מטמון זיכרון פנימי (RAM) לשמירת מפתחות ה-OAuth שנמשכו דינמית מה-DB (אם הוגדרו פרטי Supabase ב-.env)
let secretsCache = {};

async function fetchDynamicSecrets() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return secretsCache;

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ניסיון שליפה מטבלת gemmcp_settings או fallback ל-omnimcp_settings
    let { data, error } = await supabase.from('gemmcp_settings').select('*');
    if (error) {
      const fallback = await supabase.from('omnimcp_settings').select('*');
      if (!fallback.error) {
        data = fallback.data;
        error = null;
      }
    }

    if (!error && Array.isArray(data)) {
      data.forEach(row => {
        const sName = row.service_name;
        const secretKey = row.api_key;
        let cId = '';

        if (row.config && typeof row.config === 'object') {
          cId = row.config.client_id || row.config.clientId || '';
        } else if (typeof row.config === 'string') {
          try { 
            const parsed = JSON.parse(row.config);
            cId = parsed.client_id || parsed.clientId || ''; 
          } catch(e) {}
        }

        secretsCache[sName] = {
          clientId: cId,
          clientSecret: secretKey
        };
      });
      console.log('🔑 [Secrets Vault] מפתחות ה-OAuth נטענו בהצלחה דינמית מטבלת gemmcp_settings / omnimcp_settings:', Object.keys(secretsCache));
    } else if (error) {
      console.error('❌ [Secrets Vault] שגיאה בשליפת מפתחות מ-gemmcp_settings:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ [Secrets Vault] לא ניתן היה למשוך מפתחות דינמיים מ-gemmcp_settings:', err.message);
  }
  return secretsCache;
}

// טעינה ראשונית בעת עליית השרת
fetchDynamicSecrets();

// נקודת קצה להחלפת OAuth code בטוקן
app.post('/api/oauth/exchange', async (req, res) => {
  try {
    const { service, code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing code parameter' });
    }

    // רענון/ווידוא מפתחות מה-Vault במידת הצורך
    if (!secretsCache[service]) {
      await fetchDynamicSecrets();
    }

    const serviceVault = secretsCache[service] || {};

    if (service === 'notion') {
      const clientId = serviceVault.clientId || process.env.NOTION_CLIENT_ID;
      const clientSecret = serviceVault.clientSecret || process.env.NOTION_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.status(500).json({
          success: false,
          error: 'מפתחות Notion OAuth לא נמצאו בשרת או בטבלת gemmcp_settings'
        });
      }

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri || 'http://localhost:3000/oauth/callback'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: data.error_description || data.error || data.message || 'Failed to exchange Notion code' });
      }

      return res.json({
        success: true,
        accessToken: data.access_token,
        workspaceName: data.workspace_name || 'Notion Workspace'
      });
    }

    if (service === 'github') {
      const clientId = serviceVault.clientId || process.env.GITHUB_CLIENT_ID;
      const clientSecret = serviceVault.clientSecret || process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({
          success: false,
          error: 'מפתחות GitHub OAuth לא נמצאו בשרת או בטבלת gemmcp_settings'
        });
      }

      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri || 'http://localhost:3000/oauth/callback'
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return res.status(400).json({ success: false, error: data.error_description || data.error || 'Failed to exchange GitHub code' });
      }

      return res.json({
        success: true,
        accessToken: data.access_token
      });
    }

    if (service === 'supabase') {
      const clientId = serviceVault.clientId || process.env.SUPABASE_CLIENT_ID || 'f76e03ca-00e4-4c01-931e-10c4082315b1';
      const clientSecret = serviceVault.clientSecret || process.env.SUPABASE_CLIENT_SECRET;

      if (!clientSecret) {
        return res.status(500).json({
          success: false,
          error: 'מפתח SUPABASE_CLIENT_SECRET לא נמצא בטבלת gemmcp_settings'
        });
      }

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch('https://api.supabase.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || 'http://localhost:3000/oauth/callback'
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return res.status(400).json({ success: false, error: data.error_description || data.error || data.message || 'Failed to exchange Supabase code' });
      }

      return res.json({
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token
      });
    }

    return res.status(400).json({ success: false, error: `Unsupported service: ${service}` });
  } catch (err) {
    console.error('[OAuth Exchange Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- WINDOWS MCP ENDPOINTS & SERVER-SIDE SECURITY ---

// בדיקת בטיחות לפקודות שורת פקודה (PowerShell / CMD)
function checkDangerousWindowsCommands(cmd) {
  if (!cmd || typeof cmd !== 'string') return;
  const upper = cmd.toUpperCase();
  const blacklisted = [
    'FORMAT ',
    'DISKPART',
    'REG DELETE',
    'RD /S /Q C:',
    'RMDIR /S /Q C:',
    'DEL /F /S /Q C:\\WINDOWS',
    'REMOVE-ITEM -RECURSE -FORCE C:\\WINDOWS',
    ':(){ :|:& };:',
    'DROP DATABASE'
  ];
  for (const bl of blacklisted) {
    if (upper.includes(bl)) {
      throw new Error(`פעולה חסומה מטעמי בטיחות מערכת: שימוש בפקודה '${bl}' אסור.`);
    }
  }
}

// הרחבת נתיב משתמש: ~ (תיקיית הבית) ומשתני סביבה בסגנון %VAR% (למשל %USERPROFILE%)
function expandPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;
  let p = inputPath.trim();

  // הרחבת ~ לתיקיית הבית של המשתמש (Windows: C:\Users\<user>)
  if (p === '~') {
    p = os.homedir();
  } else if (p.startsWith('~/') || p.startsWith('~\\')) {
    p = path.join(os.homedir(), p.slice(2));
  }

  // הרחבת משתני סביבה בסגנון %VAR% (חיפוש לא תלוי רישיות)
  p = p.replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(process.env).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? process.env[key] : match;
  });

  return p;
}

// קבלת הרשאות מהתוסף (req.body.permissions) עם ברירות מחדל וגיבוי של .env
function resolvePermissions(clientPerms = {}) {
  return {
    readFiles: clientPerms.readFiles !== undefined ? !!clientPerms.readFiles : (process.env.WIN_PERM_READ !== 'false'),
    writeFiles: clientPerms.writeFiles !== undefined ? !!clientPerms.writeFiles : (process.env.WIN_PERM_WRITE === 'true'),
    runCommands: clientPerms.runCommands !== undefined ? !!clientPerms.runCommands : (process.env.WIN_PERM_COMMANDS === 'true'),
    launchApps: clientPerms.launchApps !== undefined ? !!clientPerms.launchApps : (process.env.WIN_PERM_APPS !== 'false'),
    clipboard: clientPerms.clipboard !== undefined ? !!clientPerms.clipboard : (process.env.WIN_PERM_CLIPBOARD !== 'false'),
    allowedPath: (clientPerms.allowedPath ? path.resolve(expandPath(clientPerms.allowedPath)) : (process.env.WIN_ALLOWED_PATH ? path.resolve(expandPath(process.env.WIN_ALLOWED_PATH)) : null))
  };
}

// Endpoint מרכזי לביצוע פעולות Windows MCP
app.post('/api/windows/execute', async (req, res) => {
  try {
    const { action, params = {}, permissions = {} } = req.body;
    const perms = resolvePermissions(permissions);

    // בדיקת נתיב מותר (Allowed Directory Scope)
    function validatePathInScope(targetPath) {
      if (!targetPath) return;
      const resolved = path.resolve(expandPath(targetPath));
      if (perms.allowedPath && !resolved.toLowerCase().startsWith(perms.allowedPath.toLowerCase())) {
        throw new Error(`הגישה לנתיב '${targetPath}' נחסמה. הנתיב המורשה בהגדרות השרת הוא: ${perms.allowedPath}`);
      }
      return resolved;
    }

    switch (action) {
      // 1. קריאת קובץ
      case 'read_file': {
        if (!perms.readFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת קריאת קבצים (WIN_PERM_READ) כבויה בשרת.' });
        }
        if (!params.path) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר path של הקובץ לקריאה' });
        }
        const filePath = validatePathInScope(params.path);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, error: `הקובץ אינו קיים: ${params.path}` });
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return res.json({ success: true, data: { path: params.path, content: content.slice(0, 50000), truncated: content.length > 50000 } });
      }

      // 2. רשימת קבצים בתיקייה
      case 'list_directory': {
        if (!perms.readFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת קריאת קבצים ותיקיות (WIN_PERM_READ) כבויה בשרת.' });
        }
        const dirPath = validatePathInScope(params.path || perms.allowedPath || process.cwd());
        if (!fs.existsSync(dirPath)) {
          return res.status(404).json({ success: false, error: `התיקייה אינה קיימת: ${params.path}` });
        }
        const items = fs.readdirSync(dirPath, { withFileTypes: true }).map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          path: path.join(dirPath, item.name)
        }));
        return res.json({ success: true, data: { directory: dirPath, items: items.slice(0, 100) } });
      }

      // 3. כתיבה או יצירת קובץ
      case 'write_file': {
        if (!perms.writeFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת כתיבת ועריכת קבצים כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.path || typeof params.content !== 'string') {
          return res.status(400).json({ success: false, error: 'חסרים פרמטרי path או content לכתיבה' });
        }
        const filePath = validatePathInScope(params.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, params.content, 'utf8');
        return res.json({ success: true, data: { message: `הקובץ נשמר בהצלחה בנתיב: ${filePath}`, bytes: Buffer.byteLength(params.content, 'utf8') } });
      }

      // 4. הרצת פקודת PowerShell / CMD
      case 'run_command': {
        if (!perms.runCommands) {
          return res.status(403).json({ success: false, error: 'הרשאת הרצת פקודות מערכת כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.command) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר command להרצה' });
        }
        checkDangerousWindowsCommands(params.command);

        const cwd = perms.allowedPath || process.cwd();
        exec(params.command, { cwd, shell: 'powershell.exe', timeout: 30000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
          if (error) {
            return res.json({
              success: false,
              error: error.message,
              stderr: stderr ? stderr.toString() : null,
              stdout: stdout ? stdout.toString() : null
            });
          }
          return res.json({
            success: true,
            data: {
              stdout: (stdout || '').toString().slice(0, 30000),
              stderr: (stderr || '').toString().slice(0, 10000),
              cwd: cwd
            }
          });
        });
        return;
      }

      // 5. פתיחת אפליקציה
      case 'open_app': {
        if (!perms.launchApps) {
          return res.status(403).json({ success: false, error: 'הרשאת הפעלת תוכנות (WIN_PERM_APPS) כבויה בשרת.' });
        }
        if (!params.app_name && !params.path) {
          return res.status(400).json({ success: false, error: 'חסר שם אפליקציה או נתיב להרצה (app_name)' });
        }
        
        let appTarget = (params.path || params.app_name || '').trim();
        const appLow = appTarget.toLowerCase().replace(/['"״]/g, '');

        const appAliases = {
          // AI & Chat
          'claude': 'claude',
          'קלוד': 'claude',
          'chatgpt': 'chatgpt',
          'gpt': 'chatgpt',
          'גפט': 'chatgpt',
          // Productivity & Code
          'vscode': 'code',
          'code': 'code',
          'קוד': 'code',
          'cursor': 'cursor',
          'קראוסר': 'cursor',
          'visual studio': 'devenv',
          'notepad': 'notepad',
          'פנקס רשימות': 'notepad',
          'word': 'winword',
          'וורד': 'winword',
          'winword': 'winword',
          'excel': 'excel',
          'אקסל': 'excel',
          'powerpoint': 'powerpnt',
          'פאוורפוינט': 'powerpnt',
          'notion': 'notion:',
          'נושן': 'notion:',
          'figma': 'figma:',
          'פיגמה': 'figma:',
          // Communication
          'whatsapp': 'whatsapp:',
          'ווטסאפ': 'whatsapp:',
          'וואטסאפ': 'whatsapp:',
          'telegram': 'telegram:',
          'טלגרם': 'telegram:',
          'discord': 'discord:',
          'דיסקורד': 'discord:',
          'slack': 'slack:',
          'סלאק': 'slack:',
          'teams': 'msteams:',
          'טימס': 'msteams:',
          // Media & Utilities
          'spotify': 'spotify:',
          'ספוטיפיי': 'spotify:',
          'calc': 'calculator:',
          'calculator': 'calculator:',
          'מחשבון': 'calculator:',
          'paint': 'mspaint',
          'צייר': 'mspaint',
          'camera': 'microsoft.windows.camera:',
          'מצלמה': 'microsoft.windows.camera:',
          'explorer': 'explorer',
          'סייר הקבצים': 'explorer',
          'settings': 'ms-settings:',
          'הגדרות': 'ms-settings:',
          'clock': 'ms-clock:',
          'שעון': 'ms-clock:',
          'store': 'ms-windows-store:',
          'חנות': 'ms-windows-store:',
          'taskmgr': 'taskmgr',
          'מנהל המשימות': 'taskmgr',
          'cmd': 'cmd',
          'powershell': 'powershell',
          'terminal': 'wt',
          'טרמינל': 'wt',
          // Browsers
          'chrome': 'chrome',
          'כרום': 'chrome',
          'edge': 'msedge',
          'אדג': 'msedge',
          'brave': 'brave',
          'firefox': 'firefox'
        };

        let targetToRun = appAliases[appLow] || appTarget;

        // הרצה ישירה דרך cmd /c start המקפיצה מיד כל פרוטוקול/תוכנה בשולחן העבודה
        const targetCommand = targetToRun.includes(':') 
          ? `start "" "${targetToRun}"` 
          : `start "" ${targetToRun}`;

        exec(targetCommand, { windowsHide: false }, (cmdErr) => {
          if (!cmdErr) {
            return res.json({ success: true, data: { message: `היישום '${appTarget}' הופעל בהצלחה ב-Windows!` } });
          }

          // Fallback ל-PowerShell במידה ו-cmd start נכשל
          execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Start-Process "${targetToRun}"`], (psErr) => {
            if (psErr) {
              return res.status(500).json({ success: false, error: `שגיאה בפתיחת ${appTarget}: ${psErr.message}` });
            }
            return res.json({ success: true, data: { message: `היישום '${appTarget}' הופעל בהצלחה ב-Windows!` } });
          });
        });
        return;
      }

      // 6. קריאה או כתיבה ללוח (Clipboard)
      case 'clipboard_read': {
        if (!perms.clipboard) {
          return res.status(403).json({ success: false, error: 'הרשאת גישה ללוח (WIN_PERM_CLIPBOARD) כבויה בשרת.' });
        }
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'], (error, stdout) => {
          if (error) {
            return res.status(500).json({ success: false, error: error.message });
          }
          return res.json({ success: true, data: { clipboard_content: (stdout || '').trim() } });
        });
        return;
      }

      case 'clipboard_write': {
        if (!perms.clipboard) {
          return res.status(403).json({ success: false, error: 'הרשאת גישה ללוח (WIN_PERM_CLIPBOARD) כבויה בשרת.' });
        }
        const textToCopy = params.text || '';
        const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'], (error) => {
          if (error) {
            return res.status(500).json({ success: false, error: error.message });
          }
          return res.json({ success: true, data: { message: 'הטקסט הועתק ללוח של Windows בהצלחה!' } });
        });
        if (child.stdin) {
          child.stdin.end(textToCopy, 'utf8');
        }
        return;
      }

      default:
        return res.status(400).json({
          success: false,
          error: `פעולה לא מוכרת ב-Windows MCP: '${action}'. פעולות אפשריות: read_file, write_file, list_directory, run_command, open_app, clipboard_read, clipboard_write.`
        });
    }
  } catch (err) {
    console.error('[Windows MCP Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// בדיקת תקינות שרת
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', bridge: 'GemMCP-Gemini-Bridge', platform: process.platform });
});

// עדכון אוטומטי של התוסף ושרת ה-Bridge ישירות מ-GitHub
app.post('/api/update', async (req, res) => {
  console.log('🔄 התקבלה בקשת עדכון אוטומטי מהתוסף...');
  const rootDir = path.resolve(__dirname, '..');
  const bridgeDir = path.resolve(__dirname);
  const isGitRepo = fs.existsSync(path.join(rootDir, '.git'));

  const runCmd = (cmd, cwd) => {
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd, shell: 'powershell.exe', timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.toString() || stdout?.toString() || error.message));
        } else {
          resolve((stdout || '').toString().trim());
        }
      });
    });
  };

  let updateMethod = 'git';
  let updateLog = [];

  try {
    if (isGitRepo) {
      updateLog.push('מבצע git pull origin main...');
      try {
        const gitOut = await runCmd('git pull origin main', rootDir);
        updateLog.push(`Git output: ${gitOut}`);
      } catch (gitErr) {
        console.warn('⚠️ Git pull נכשל, מנסה מסלול הורדת ZIP ישירה:', gitErr.message);
        updateMethod = 'zip';
      }
    } else {
      updateMethod = 'zip';
    }

    if (updateMethod === 'zip') {
      updateLog.push('מוריד חבילת עדכון אחרונה מ-GitHub...');
      const zipUrl = 'https://github.com/SSSHMUEL/GemMCP/archive/refs/heads/main.zip';
      const psScript = `
        $ProgressPreference = 'SilentlyContinue'
        $zipPath = Join-Path $env:TEMP "GemMCP-latest.zip"
        $extractPath = Join-Path $env:TEMP "GemMCP-extracted"
        if (Test-Path $extractPath) { Remove-Item -Recurse -Force $extractPath }
        Invoke-WebRequest -Uri "${zipUrl}" -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        $innerFolder = Get-ChildItem -Path $extractPath | Where-Object { $_.PSIsContainer } | Select-Object -First 1
        if ($innerFolder) {
          Get-ChildItem -Path $innerFolder.FullName -Recurse | ForEach-Object {
            $rel = $_.FullName.Substring($innerFolder.FullName.Length + 1)
            $target = Join-Path "${rootDir.replace(/\\/g, '\\\\')}" $rel
            if ($rel -notmatch '^bridge-server\\\\(\\.env|node_modules)') {
              if ($_.PSIsContainer) {
                if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
              } else {
                $targetDir = Split-Path $target -Parent
                if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
                Copy-Item -Path $_.FullName -Destination $target -Force
              }
            }
          }
        }
        Remove-Item -Recurse -Force $extractPath -ErrorAction SilentlyContinue
        Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
      `;
      await runCmd(psScript, rootDir);
      updateLog.push('הקבצים חולצו ועודכנו בהצלחה!');
    }

    // עדכון תלויות npm ב-bridge-server
    try {
      updateLog.push('מעדכן תלויות ב-bridge-server...');
      await runCmd('npm install --no-audit --no-fund', bridgeDir);
      updateLog.push('npm install הושלם בהצלחה.');
    } catch (npmErr) {
      console.warn('⚠️ npm install נתקל באזהרה (העדכון עדיין הושלם):', npmErr.message);
    }

    // רישום מחדש של הפרוטוקול
    const regBat = path.join(rootDir, 'register-protocol.bat');
    if (fs.existsSync(regBat)) {
      try {
        await runCmd(`cmd.exe /c "${regBat}"`, rootDir);
      } catch (e) {}
    }

    // קריאת גרסה עדכנית מ-manifest.json
    let newVersion = '2.1.1';
    try {
      const manifestRaw = fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(manifestRaw);
      newVersion = manifest.version || newVersion;
    } catch (e) {}

    console.log('✅ העדכון הושלם בהצלחה לגרסה:', newVersion);
    return res.json({
      success: true,
      message: 'העדכון הושלם בהצלחה!',
      newVersion,
      updateMethod,
      logs: updateLog
    });
  } catch (err) {
    console.error('❌ שגיאה בביצוע עדכון דרך ה-Bridge:', err.message);
    return res.status(500).json({
      success: false,
      error: `שגיאה בעדכון: ${err.message}`,
      logs: updateLog
    });
  }
});

// כיבוי שרת ה-Bridge לפי בקשת המשתמש
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'שרת ה-Bridge נסגר בהצלחה.' });
  console.log('🛑 התקבלה בקשת כיבוי שרת מהתוסף - סוגר תהליך...');
  try {
    if (typeof server !== 'undefined' && server.close) {
      server.close();
    }
  } catch (e) {}
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

// הפעלת השרת
const server = app.listen(PORT, HOST, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Windows Bridge Server רץ ומאזין בכתובת: http://${HOST}:${PORT}`);
  console.log(`🔒 נעול לגישה מקומית בלבד (Localhost / Extensions)`);
  console.log(`==================================================\n`);
});

