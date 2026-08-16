/**
 * GemMCP Background Service Worker - Multi-Service Router
 * מטפל ב-Supabase, GitHub, Notion, Web Fetching, ו-Custom MCP
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GemMCP] Extension installed & background service worker active');
});

const NOTION_CLIENT_ID = '3bcd872b-594c-811c-8b80-0037d2a8c87a';
const NOTION_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

const GITHUB_CLIENT_ID = 'Ov23liOnkmB3tYpaHe6D';
const GITHUB_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

const CLOUD_OAUTH_ENDPOINT = 'https://iqakletdnmpsadznynnv.supabase.co/functions/v1/oauth-exchange';
const LOCAL_OAUTH_ENDPOINT = 'http://localhost:3000/api/oauth/exchange';

async function performOAuthExchange(service, code, redirectUri) {
  // 1. ניסיון ענן מאובטח (Supabase Edge Function) - ללא צורך בהרצת שרת מקומי
  try {
    const cloudRes = await fetch(CLOUD_OAUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, code, redirectUri })
    });
    if (cloudRes.ok) {
      const data = await cloudRes.json();
      if (data.success || data.accessToken) return data;
    }
  } catch (e) {
    console.warn('[GemMCP] Cloud OAuth endpoint unreachable, trying local bridge...', e);
  }

  // 2. Fallback: שרת ה-Bridge המקומי (אם המשתמש מריץ שרת מקומי משלו)
  const localRes = await fetch(LOCAL_OAUTH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, code, redirectUri })
  });

  if (!localRes.ok) {
    const err = await localRes.json().catch(() => ({ error: 'OAuth exchange failed' }));
    throw new Error(err.error || 'OAuth token exchange failed');
  }

  return await localRes.json();
}

// ⚡ האזנה אוטומטית ל-Redirect של ה-OAuth (Supabase, Notion & GitHub)
const processedCodes = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // נגיב רק כאשר ה-URL מתעדכן או שהדף מסיים טעינה (למניעת יריות כפולות)
  if (changeInfo.status !== 'loading' && !changeInfo.url) return;

  const urlToCheck = changeInfo.url || tab.url || '';
  if (urlToCheck.includes('/oauth/callback') && urlToCheck.includes('code=')) {
    try {
      const parsed = new URL(urlToCheck);
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      
      if (code && !processedCodes.has(code)) {
        processedCodes.add(code);
        // זיהוי ודאי של השירות לפי פרמטר ה-state או ה-storage
        const stored = await chrome.storage.sync.get(['pendingOAuthService']);
        const service = state || stored.pendingOAuthService || 'github';

        if (service === 'notion') {
          console.log('[GemMCP] Exchanging Notion OAuth Code via Cloud / Bridge Server...');
          
          let notionData;
          try {
            notionData = await performOAuthExchange('notion', code, NOTION_REDIRECT_URI);
          } catch (e) {
            console.error('[GemMCP] Notion OAuth exchange error:', e);
            const errUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=notion&error=${encodeURIComponent(e.message || 'שגיאה באימות מול Notion')}`);
            chrome.tabs.update(tabId, { url: errUrl }).catch(() => {});
            return;
          }

          const accessToken = notionData.accessToken;
          const workspaceName = notionData.workspaceName || 'Notion Workspace';

          const storedActive = await chrome.storage.sync.get(['activeServices']);
          const activeServices = storedActive.activeServices || ['supabase', 'fetch'];
          if (!activeServices.includes('notion')) activeServices.push('notion');

          await chrome.storage.sync.set({
            notionApiKey: accessToken,
            notionWorkspaceName: workspaceName,
            notionConnected: true,
            activeServices: activeServices,
            pendingOAuthService: null
          });

          console.log(`[GemMCP] Successfully connected Notion Workspace: ${workspaceName}`);

          const successUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=notion&name=${encodeURIComponent(workspaceName)}`);
          chrome.tabs.update(tabId, { url: successUrl }).catch(() => {});

          setTimeout(() => {
            chrome.tabs.remove(tabId).catch(() => {});
          }, 3200);
        } else if (service === 'github') {
          console.log('[GemMCP] Exchanging GitHub OAuth Code via Cloud / Bridge Server...');
          
          let tokenData;
          try {
            tokenData = await performOAuthExchange('github', code, GITHUB_REDIRECT_URI);
          } catch (e) {
            console.error('[GemMCP] GitHub OAuth exchange error:', e);
            const errUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=github&error=${encodeURIComponent(e.message || 'שגיאה באימות מול GitHub')}`);
            chrome.tabs.update(tabId, { url: errUrl }).catch(() => {});
            return;
          }

          const accessToken = tokenData.accessToken;

          if (!accessToken) {
            console.error('[GemMCP] GitHub OAuth missing access_token in response:', tokenData);
            const errUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=github&error=${encodeURIComponent('לא התקבל טוקן מ-GitHub')}`);
            chrome.tabs.update(tabId, { url: errUrl }).catch(() => {});
            return;
          }

          // משיכת שם המשתמש מ-GitHub API
          let username = '';
          try {
            const userRes = await fetch('https://api.github.com/user', {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'GemMCP-Extension'
              }
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              username = userData.login || '';
            }
          } catch (e) {
            console.warn('[GemMCP] Could not fetch GitHub profile:', e);
          }

          const storedActive = await chrome.storage.sync.get(['activeServices']);
          const activeServices = storedActive.activeServices || ['supabase', 'fetch'];
          if (!activeServices.includes('github')) activeServices.push('github');

          await chrome.storage.sync.set({
            githubToken: accessToken,
            githubUsername: username,
            githubConnected: true,
            activeServices: activeServices,
            pendingOAuthService: null
          });

          console.log(`[GemMCP] Successfully connected GitHub Account: ${username || 'Connected'}`);

          const successUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=github&name=${encodeURIComponent(username || 'GitHub')}`);
          chrome.tabs.update(tabId, { url: successUrl }).catch(() => {});

          setTimeout(() => {
            chrome.tabs.remove(tabId).catch(() => {});
          }, 3200);
        } else if (service === 'supabase') {
          console.log('[GemMCP] Exchanging Supabase OAuth Code via Cloud / Bridge Server...');
          
          let tokenData;
          try {
            tokenData = await performOAuthExchange('supabase', code, 'http://localhost:3000/oauth/callback');
          } catch (e) {
            console.error('[GemMCP] Supabase OAuth exchange error:', e);
            const errUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=supabase&error=${encodeURIComponent(e.message || 'שגיאה באימות מול Supabase')}`);
            chrome.tabs.update(tabId, { url: errUrl }).catch(() => {});
            return;
          }

          const accessToken = tokenData.accessToken;
          const refreshToken = tokenData.refreshToken;

          const storedActive = await chrome.storage.sync.get(['activeServices']);
          const activeServices = storedActive.activeServices || ['supabase', 'fetch'];
          if (!activeServices.includes('supabase')) activeServices.push('supabase');

          let projectName = '';
          try {
            const projRes = await fetch('https://api.supabase.com/v1/projects', {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (projRes.ok) {
              const projects = await projRes.json();
              if (Array.isArray(projects) && projects.length > 0) {
                const firstProj = projects[0];
                projectName = firstProj.name;
                const projectUrl = `https://${firstProj.id}.supabase.co`;
                
                try {
                  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${firstProj.id}/api-keys`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  if (keysRes.ok) {
                    const keys = await keysRes.json();
                    const serviceKey = keys.find(k => k.name === 'service_role key') || keys.find(k => k.name === 'anon key') || keys[0];
                    if (serviceKey && serviceKey.api_key) {
                      await chrome.storage.sync.set({
                        supabaseUrl: projectUrl,
                        supabaseKey: serviceKey.api_key
                      });
                    }
                  }
                } catch(kErr) {}
              }
              await chrome.storage.sync.set({
                supabaseConnected: true,
                supabaseProjectName: projectName,
                supabaseAccessToken: accessToken,
                supabaseRefreshToken: refreshToken,
                activeServices: activeServices,
                pendingOAuthService: null
              });
            }
          } catch (projErr) {
            console.warn('[GemMCP] Could not auto-discover projects, storing token:', projErr);
            await chrome.storage.sync.set({
              supabaseConnected: true,
              supabaseAccessToken: accessToken,
              activeServices: activeServices,
              pendingOAuthService: null
            });
          }

          console.log(`[GemMCP] Successfully connected Supabase: ${projectName || 'Connected'}`);

          const successUrl = chrome.runtime.getURL(`popup/oauth-success.html?service=supabase&name=${encodeURIComponent(projectName || 'Supabase')}`);
          chrome.tabs.update(tabId, { url: successUrl }).catch(() => {});

          setTimeout(() => {
            chrome.tabs.remove(tabId).catch(() => {});
          }, 3200);
        }
      }
    } catch (err) {
      console.error('[GemMCP] OAuth connection error:', err);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXECUTE_MCP_TOOL') {
    handleOmniToolExecution(request.service, request.toolCall, request.config)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message || err }));
    return true;
  }

  if (request.action === 'TEST_SERVICE_CONNECTION') {
    testServiceConnection(request.service, request.config)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, error: err.message || err }));
    return true;
  }

  // סגירת טאב בטוחה ומהירה מעמוד ההצלחה
  if (request.action === 'CLOSE_TAB') {
    if (sender?.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
    return true;
  }

  // 🛑 כיבוי יזום של שרת ה-Bridge לפי בקשת המשתמש
  if (request.action === 'SHUTDOWN_BRIDGE_SERVER') {
    shutdownBridgeServer()
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, error: err.message || err }));
    return true;
  }

  // 🚀 משיכת פרויקטים ומפתחות אוטומטית מ-Supabase לפי Access Token
  if (request.action === 'SUPABASE_AUTO_DISCOVER') {
    discoverSupabaseProjects(request.token)
      .then((projects) => sendResponse({ success: true, projects }))
      .catch((err) => sendResponse({ success: false, error: err.message || err }));
    return true;
  }
});

/**
 * 🛑 כיבוי שרת ה-Bridge
 */
async function shutdownBridgeServer() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      return 'שרת ה-Bridge כובה בהצלחה.';
    }
  } catch (e) {
    // השרת נסגר וניתק את החיבור
    return 'שרת ה-Bridge נסגר.';
  }
  return 'שרת ה-Bridge נסגר.';
}

/**
 * ⚡ משיכת רשימת פרויקטים ומפתחות API באופן אוטומטי מ-Supabase Management API
 */
async function discoverSupabaseProjects(token) {
  if (!token || !token.trim()) {
    throw new Error('נא להזין Access Token תקין של Supabase');
  }

  const cleanToken = token.trim();
  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: {
      'Authorization': `Bearer ${cleanToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`שגיאת התחברות ל-Supabase: ${errText || res.statusText}`);
  }

  const projects = await res.json();
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('לא נמצאו פרויקטים בחשבון Supabase זה');
  }

  // שליפת מפתחות API עבור כל פרויקט
  const results = [];
  for (const p of projects) {
    const projectRef = p.id;
    let anonKey = '';
    let serviceKey = '';

    try {
      const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (keysRes.ok) {
        const keys = await keysRes.json();
        const anonObj = keys.find(k => k.name === 'anon');
        const servObj = keys.find(k => k.name === 'service_role');
        anonKey = anonObj ? anonObj.api_key : '';
        serviceKey = servObj ? servObj.api_key : '';
      }
    } catch (e) {
      console.warn('Could not fetch keys for project', projectRef, e);
    }

    results.push({
      id: projectRef,
      name: p.name || projectRef,
      url: `https://${projectRef}.supabase.co`,
      apiKey: serviceKey || anonKey || '',
      region: p.region
    });
  }

  return results;
}

function normalizeServiceName(service) {
  if (!service) return '';
  const s = String(service).toLowerCase().trim();
  if (['filesystem', 'fs', 'files', 'file', 'os', 'windows', 'system', 'cmd', 'powershell', 'shell', 'bash'].includes(s)) return 'windows';
  if (['web', 'fetch', 'scraper', 'crawl', 'crawler', 'browser', 'http'].includes(s)) return 'fetch';
  if (['db', 'database', 'postgres', 'postgresql', 'sql', 'supabase'].includes(s)) return 'supabase';
  if (['git', 'github', 'repo'].includes(s)) return 'github';
  if (['notion', 'notes', 'docs'].includes(s)) return 'notion';
  return s;
}

/**
 * נתב פקודות ראשי
 */
async function handleOmniToolExecution(service, toolCall, config) {
  const activeServices = Array.isArray(config?.activeServices) ? config.activeServices : ['supabase', 'fetch'];
  const srv = normalizeServiceName(service);
  const isActive = srv === 'custom' || srv.startsWith('custom_')
    ? (activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_')))
    : activeServices.includes(srv);

  if (!isActive) {
    throw new Error(`השירות [${service}] מנוטרל בהגדרות התוסף ולא יבוצע.`);
  }

  switch (srv) {
    case 'windows':
      return await executeWindowsMcp(toolCall, config);
    case 'supabase':
      return await executeSupabase(toolCall, config);
    case 'github':
      return await executeGitHub(toolCall, config);
    case 'notion':
      return await executeNotion(toolCall, config);
    case 'fetch':
      return await executeFetch(toolCall);
    case 'custom':
      return await executeCustomMcp(toolCall, config);
    default:
      throw new Error(`שירות לא מוכר: ${service}`);
  }
}

/**
 * 🪟 ביצוע פעולות Windows OS מול ה-Bridge Server המקומי
 * כולל מנגנון Auto-Launch ו-Retry שקוף במקרה שהשרת כבוי
 */
async function executeWindowsMcp(toolCall, config) {
  const bridgeUrl = 'http://127.0.0.1:3000/api/windows/execute';
  
  // חילוץ פעולה ופרמטרים
  let action = toolCall.action || toolCall.tool_name || 'read_file';
  if (action.startsWith('windows:')) {
    action = action.replace('windows:', '');
  }

  const payload = {
    action: action,
    params: {
      path: toolCall.path,
      content: toolCall.content,
      command: toolCall.command || toolCall.cmd,
      app_name: toolCall.app_name || toolCall.app,
      text: toolCall.text
    },
    permissions: {
      readFiles: config?.winPermissions?.readFiles ?? true,
      writeFiles: config?.winPermissions?.writeFiles ?? false,
      runCommands: config?.winPermissions?.runCommands ?? false,
      launchApps: config?.winPermissions?.launchApps ?? true,
      clipboard: config?.winPermissions?.clipboard ?? true,
      allowedPath: config?.winAllowedPath || null
    }
  };

  async function tryFetchOnce(timeoutMs = 4000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `שגיאת שרת מקומי (${res.status})`);
      }
      return data.data;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // 1. ניסיון פנייה ראשוני
  try {
    return await tryFetchOnce(3500);
  } catch (initialErr) {
    const isNetworkError = initialErr.name === 'AbortError' ||
      (initialErr.message && (initialErr.message.includes('Failed to fetch') || initialErr.message.includes('NetworkError')));

    if (!isNetworkError) {
      throw initialErr;
    }

    // 2. השרת אינו רץ - הפעלה שקטה אוטומטית בעת שימוש בכלי!
    console.log('[GemMCP Background] Windows Bridge אינו פועל - מפעיל אוטומטית ברקע וממתין להרצה...');
    
    // שליחת פקודת התנעה ל-Windows דרך הטאב הפעיל
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_BRIDGE_STARTUP' }).catch(() => {});
    }

    // 3. לולאת המתנה קצרה להתעוררות השרת (עד 6 שניות)
    const startTime = Date.now();
    let serverReady = false;

    while (Date.now() - startTime < 6000) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const pingCtrl = new AbortController();
        const pingTId = setTimeout(() => pingCtrl.abort(), 800);
        const healthRes = await fetch('http://127.0.0.1:3000/api/health', { signal: pingCtrl.signal });
        clearTimeout(pingTId);
        if (healthRes.ok) {
          serverReady = true;
          break;
        }
      } catch (e) {
        // השרת עדיין עולה
      }
    }

    // 4. ניסיון ביצוע חוזר לאחר שהשרת התעורר
    if (serverReady) {
      console.log('[GemMCP Background] שרת ה-Bridge עלה בהצלחה! מבצע כעת את הפקודה המבוקשת...');
      return await tryFetchOnce(4000);
    }

    throw new Error('שרת ה-Bridge לא היה פעיל. נשלחה פקודת הפעלה אוטומטית, וודא שאישרת או שהרצת register-protocol.bat.');
  }
}

/**
 * ⚡ ביצוע שאילתה ב-Supabase
 */
async function executeSupabase(toolCall, config) {
  let { supabaseUrl, supabaseKey } = config;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('חסרים פרטי חיבור ל-Supabase בהגדרות');
  }

  let baseUrl = supabaseUrl.trim().replace(/\/+$/, '');
  let query = (toolCall.query || '').trim().replace(/;+$/, '').trim();

  if (!query && toolCall.action === 'list_tables') {
    query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;";
  }

  const endpoint = `${baseUrl}/rest/v1/rpc/exec_sql`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey.trim(),
      'Authorization': `Bearer ${supabaseKey.trim()}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase Error (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * 🐙 אינטגרציית GitHub
 */
async function executeGitHub(toolCall, config) {
  const { githubToken } = config;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'GemMCP-Gemini-Extension'
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken.trim()}`;
  }

  const action = toolCall.action;

  if (action === 'get_file' || action === 'github:get_file') {
    const { repo, path, branch = 'main' } = toolCall;
    if (!repo || !path) throw new Error('חסר שם מאגר (repo) או נתיב קובץ (path)');

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
    if (!res.ok) throw new Error(`GitHub error: ${res.statusText}`);
    const data = await res.json();
    
    if (data.content) {
      return {
        path: data.path,
        size: data.size,
        content: decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
      };
    }
    return data;
  }

  if (action === 'list_repos' || action === 'github:list_repos') {
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=15', { headers });
    if (!res.ok) throw new Error(`GitHub error: ${res.statusText}`);
    const repos = await res.json();
    return repos.map(r => ({ name: r.full_name, private: r.private, description: r.description, stars: r.stargazers_count, url: r.html_url }));
  }

  if (action === 'create_issue' || action === 'github:create_issue') {
    const { repo, title, body } = toolCall;
    if (!repo || !title) throw new Error('חסר שם מאגר או כותרת Issue');
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, body: body || '' })
    });
    if (!res.ok) throw new Error(`GitHub error: ${res.statusText}`);
    return await res.json();
  }

  if (action === 'create_repo' || action === 'github:create_repo') {
    const { name, description = '', private: isPrivate = false, auto_init = true } = toolCall;
    if (!name) throw new Error('חסר שם המאגר (name) ליצירה ב-GitHub');
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description || '',
        private: !!isPrivate,
        auto_init: !!auto_init
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`GitHub error (${res.status}): ${errData.message || res.statusText}`);
    }
    const repo = await res.json();
    return {
      message: `המאגר '${repo.full_name}' נוצר בהצלחה ב-GitHub!`,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      description: repo.description
    };
  }

  throw new Error(`פעולת GitHub לא נתמכת: ${action}`);
}

/**
 * 📝 אינטגרציית Notion API
 */
async function executeNotion(toolCall, config) {
  const { notionApiKey } = config;
  if (!notionApiKey) throw new Error('חסר Notion API Key בהגדרות');

  let action = toolCall.action || toolCall.tool || toolCall.operation || toolCall.name || '';
  const hasPageId = !!(toolCall.page_id || toolCall.pageId || toolCall.id || toolCall.block_id);

  // זיהוי פעולה אוטומטי אם ג'מיני לא שלח action במפורש
  if (!action) {
    if (toolCall.title || toolCall.content) {
      action = 'create_page';
    } else if (hasPageId) {
      action = 'get_page';
    } else {
      action = 'search';
    }
  }

  const headers = {
    'Authorization': `Bearer ${notionApiKey.trim()}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  // 1. חיפוש או רשימת דפים
  if (['search', 'notion:search', 'list', 'list_pages', 'get_pages'].includes(action) || (action === 'read' && !hasPageId)) {
    const query = toolCall.query || toolCall.search || '';
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, page_size: 15 })
    });
    if (!res.ok) throw new Error(`Notion error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.results.map(item => ({
      id: item.id,
      type: item.object,
      url: item.url,
      title: item.properties?.title?.title?.[0]?.plain_text || item.properties?.Name?.title?.[0]?.plain_text || 'Untitled'
    }));
  }

  // 2. קריאת תוכן דף ספציפי (Blocks / Content)
  if (['get_page', 'notion:get_page', 'get_page_content', 'read_page', 'get_block_children', 'notion:get_block_children'].includes(action) || (action === 'read' && hasPageId)) {
    const pageId = (toolCall.page_id || toolCall.pageId || toolCall.id || toolCall.block_id || '').replace(/-/g, '');
    if (!pageId) {
      const res = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: toolCall.query || '', page_size: 5 })
      });
      const data = await res.json();
      return data.results;
    }

    // 1. קריאת תוכן בלוקים
    const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=50`, {
      method: 'GET',
      headers
    });
    
    let cleanBlocks = [];
    if (blocksRes.ok) {
      const blocksData = await blocksRes.json();
      cleanBlocks = (blocksData.results || []).map(b => {
        const type = b.type;
        const richText = b[type]?.rich_text;
        const textContent = richText ? richText.map(t => t.plain_text).join('') : '';
        return {
          type: type,
          text: textContent
        };
      }).filter(b => b.text || b.type);
    }

    // 2. קריאת מאפייני הדף (Properties)
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'GET',
      headers
    });
    let pageProps = {};
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      pageProps = pageData.properties || {};
    }

    return {
      pageId: pageId,
      properties: pageProps,
      blocks: cleanBlocks.length > 0 ? cleanBlocks : "הדף ריק מתוכן או שהתוכן נמצא ברמת תת-דף"
    };
  }

  // 2. יצירת דף חדש
  if (action === 'create_page' || action === 'notion:create_page') {
    const { title, content, parentPageId } = toolCall;
    if (!title) throw new Error('חסרה כותרת לדף ב-Notion');

    // חיפוש דף הורה אוטומטי אם לא הוגדר
    let parent = parentPageId ? { page_id: parentPageId } : null;
    if (!parent) {
      const searchRes = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 1 })
      });
      const searchData = await searchRes.json();
      if (searchData.results && searchData.results[0]) {
        parent = { page_id: searchData.results[0].id };
      } else {
        throw new Error('לא נמצא דף ב-Notion שבו ניתן ליצור את הפתק. אנא שתף דף עם ה-Integration');
      }
    }

    const body = {
      parent,
      properties: {
        title: {
          title: [{ text: { content: title } }]
        }
      },
      children: content ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content } }]
          }
        }
      ] : []
    };

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Notion error (${res.status}): ${await res.text()}`);
    const page = await res.json();
    return { success: true, pageId: page.id, url: page.url };
  }

  throw new Error(`פעולת Notion לא נתמכת: ${action}`);
}

/**
 * 🌐 סריקת אתרים וקריאת HTML + תמיכה בכרטיסיות פתוחות ומחוברות (Session / Logged-in Tabs)
 */
async function executeFetch(toolCall) {
  let targetUrl = (toolCall.url || toolCall.link || '').trim();
  const tabQuery = (toolCall.tab_title || toolCall.query || '').toLowerCase().trim();
  const forceDirectFetch = toolCall.force_direct === true;

  // 1. אם לא נשלח URL אלא בקשה לקרוא כרטיסייה פתוחה, או אם יש URL - נבדוק אם היא פתוחה בדפדפן
  if (!forceDirectFetch && typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const allTabs = await chrome.tabs.query({});
      let matchedTab = null;

      if (targetUrl) {
        // מציאת כרטיסייה שמתאימה ל-URL המבוקש
        const cleanTarget = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        matchedTab = allTabs.find(t => t.url && t.url.replace(/^https?:\/\//, '').replace(/\/$/, '').startsWith(cleanTarget.split('?')[0]));
      }

      if (!matchedTab && tabQuery) {
        // מציאת כרטיסייה לפי כותרת או מילת מפתח
        matchedTab = allTabs.find(t => (t.title && t.title.toLowerCase().includes(tabQuery)) || (t.url && t.url.toLowerCase().includes(tabQuery)));
      }

      // אם נמצאה כרטיסייה פתוחה מתאימה – נחלץ את הטקסט החי ישירות ממנה (כולל תוכן מאובטח ומחובר)
      if (matchedTab && matchedTab.id && chrome.scripting) {
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: matchedTab.id },
          func: () => {
            // חילוץ טקסט חכם מתוך גוף הדף
            const clone = document.body.cloneNode(true);
            const removeSelectors = ['script', 'style', 'noscript', 'svg', 'iframe'];
            removeSelectors.forEach(s => clone.querySelectorAll(s).forEach(el => el.remove()));
            
            const title = document.title || '';
            const visibleText = (clone.innerText || clone.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();
            
            return {
              title: title,
              url: window.location.href,
              content: visibleText.slice(0, 12000),
              isLiveTab: true
            };
          }
        });

        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          const tabData = injectionResults[0].result;
          return {
            source: 'live_browser_tab',
            url: tabData.url,
            title: `[כרטיסייה פתוחה ומחוברת] ${tabData.title}`,
            content: tabData.content,
            message: 'התוכן נשלף ישירות מהכרטיסייה הפתוחה בדפדפן שלך (כולל מידע מחובר/מאובטח).'
          };
        }
      }
    } catch (tabErr) {
      console.warn('[GemMCP] Could not extract from open tab, falling back to standard HTTP fetch:', tabErr);
    }
  }

  // 2. ברירת מחדל: שליפת HTTP רגילה (לדפים ציבוריים שאינם פתוחים כרטיסייה)
  if (!targetUrl) throw new Error('חסרה כתובת URL או כרטיסייה פתוחה לסריקה');

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) throw new Error(`Fetch failed with status ${res.status} (${res.statusText})`);
  const html = await res.text();

  const cleanText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);

  return { source: 'direct_http_fetch', url: targetUrl, title: 'Web Content', content: cleanText };
}

/**
 * 🔌 שרת MCP מותאם אישית (תמיכה בריבוי שרתים ובכותרות אימות מותאמות)
 */
async function executeCustomMcp(toolCall, config) {
  let targetUrl = config?.customMcpUrl || '';
  let authHeader = '';

  // בדיקה אם הקריאה מכוונת לשרת מותאם ספציפי
  const customServers = Array.isArray(config?.customServers) ? config.customServers : [];
  const targetServerId = toolCall._serverId || toolCall.server_id || (toolCall.service && toolCall.service.startsWith('custom_') ? toolCall.service : null);

  if (targetServerId && customServers.length > 0) {
    const srv = customServers.find(s => s.id === targetServerId || `custom_${s.id}` === targetServerId || s.name === targetServerId);
    if (srv && srv.url) {
      targetUrl = srv.url;
      authHeader = srv.authHeader || '';
    }
  } else if (customServers.length > 0) {
    // אם לא צוין ספציפית, קח את השרת הפעיל הראשון
    const activeCustom = customServers.find(s => s.enabled !== false && s.url);
    if (activeCustom) {
      targetUrl = activeCustom.url;
      authHeader = activeCustom.authHeader || '';
    }
  }

  if (!targetUrl) throw new Error('חסרה כתובת שרת MCP מותאם אישית (Endpoint URL)');

  const headers = { 'Content-Type': 'application/json' };
  if (authHeader && authHeader.trim()) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith('bearer ') || trimmed.toLowerCase().startsWith('basic ')) {
      headers['Authorization'] = trimmed;
    } else if (trimmed.includes(':')) {
      const [hName, ...hVal] = trimmed.split(':');
      headers[hName.trim()] = hVal.join(':').trim();
    } else {
      // ברירת מחדל אם המשתמש הזין רק טוקן
      headers['Authorization'] = `Bearer ${trimmed}`;
      headers['x-api-key'] = trimmed;
    }
  }

  const cleanToolCall = { ...toolCall };
  delete cleanToolCall._serverId;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(targetUrl.trim(), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(cleanToolCall),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`שרת MCP החזיר שגיאה (${res.status} ${res.statusText}): ${errText.slice(0, 150)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return { response: await res.text() };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Timeout: שרת ה-MCP ב-${targetUrl} לא הגיב תוך 8 שניות.`);
    }
    throw err;
  }
}

/**
 * בדיקת תקינות חיבור לשירותים (כולל בדיקת שרתי Custom MCP)
 */
async function testServiceConnection(service, config) {
  if (service === 'windows') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('http://127.0.0.1:3000/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Bridge Server response status: ${res.status}`);
      const data = await res.json();
      return `שרת Windows Bridge פועל תקין (פלטפורמה: ${data.platform || 'windows'})!`;
    } catch (e) {
      throw new Error('שרת ה-Bridge כבוי או ש-Node.js חסר. ניתן להוריד מ-https://nodejs.org ולהריץ את start-bridge.bat');
    }
  }
  if (service === 'supabase') {
    await executeSupabase({ query: 'SELECT 1 as test;' }, config);
    return 'חיבור ל-Supabase תקין לחלוטין! 🚀';
  }
  if (service === 'github') {
    const res = await executeGitHub({ action: 'list_repos' }, config);
    return `חיבור ל-GitHub תקין! נמצאו ${res.length} מאגרים.`;
  }
  if (service === 'notion') {
    const res = await executeNotion({ action: 'search', query: '' }, config);
    return `חיבור ל-Notion תקין! נמצאו ${res.length} דפים נגישים.`;
  }
  if (service === 'custom' || service.startsWith('custom_') || config?.testCustomServer) {
    const targetServer = config?.testCustomServer || {};
    const url = targetServer.url || config?.customMcpUrl;
    if (!url) throw new Error('נא להזין כתובת URL של שרת ה-MCP');

    const headers = { 'Content-Type': 'application/json' };
    const auth = (targetServer.authHeader || '').trim();
    if (auth) {
      if (auth.toLowerCase().startsWith('bearer ') || auth.toLowerCase().startsWith('basic ')) {
        headers['Authorization'] = auth;
      } else if (auth.includes(':')) {
        const [hName, ...hVal] = auth.split(':');
        headers[hName.trim()] = hVal.join(':').trim();
      } else {
        headers['Authorization'] = `Bearer ${auth}`;
        headers['x-api-key'] = auth;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      // נסיון 1: קריאת ping או בדיקת endpoint
      const res = await fetch(url.trim(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'ping', service: 'custom' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 401 || res.status === 403) {
        throw new Error(`שגיאת אימות (${res.status}): קוד החיבור / טוקן שגוי או חסר.`);
      }
      if (res.status >= 500) {
        throw new Error(`שגיאת שרת פנימית (${res.status}) ב-Endpoint.`);
      }
      return `חיבור לשרת MCP תקין וזמין! (HTTP ${res.status})`;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('השרת אינו מגיב (Timeout). וודא שהכתובת נכונה ושהשרת רץ.');
      }
      // אם POST נכשל בגלל CORS או מתודה, ננסה GET קצר לבדיקת זמינות
      try {
        const getController = new AbortController();
        const getTimeout = setTimeout(() => getController.abort(), 2500);
        const getRes = await fetch(url.trim(), { method: 'GET', headers, signal: getController.signal });
        clearTimeout(getTimeout);
        if (getRes.status === 401 || getRes.status === 403) {
          throw new Error(`שגיאת אימות (${getRes.status}): קוד החיבור שגוי או חסר.`);
        }
        return `חיבור לשרת MCP תקין וזמין! (HTTP ${getRes.status})`;
      } catch (getErr) {
        throw new Error(e.message || 'השרת לא מגיב');
      }
    }
  }
  return 'החיבור תקין!';
}
