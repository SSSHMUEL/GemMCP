/**
 * GemMCP Background Service Worker - Multi-Service Router
 * מטפל ב-Supabase, GitHub, Notion, Web Fetching, ו-Custom MCP
 */


// בחירת לשונית ג'מיני להזרקה.
//
// שלושה מקומות בחרו tabs[0] מתוך query - כלומר לשונית שרירותית, לא זו שהמשתמש
// רואה. מי שפתח כמה שיחות של ג'מיני קיבל את הפרומפט בצ'אט אחר לגמרי.
// סדר העדיפויות: הפעילה בחלון שבחזית, אחר כך כל פעילה, ורק אז הראשונה.
// האתרים שבהם התוסף פועל. מוגדר כאן, בראש הקובץ, כי הוא נקרא גם
// מפונקציות שרצות מוקדם - const שמוצהר בהמשך היה נופל ב-TDZ, וזו כבר
// הייתה תקלה בפרויקט הזה שלוש פעמים.
const SUPPORTED_ORIGINS = [
  'https://gemini.google.com/',
  'https://claude.ai/',
  'https://chatgpt.com/',
  'https://chat.openai.com/'
];
const SUPPORTED_URL_MATCHES = SUPPORTED_ORIGINS.map((o) => o + '*');

function isSupportedOrigin(url) {
  return typeof url === 'string' && SUPPORTED_ORIGINS.some((o) => url.startsWith(o));
}

async function pickGeminiTab() {
  // כל האתרים הנתמכים, לא רק ג'מיני. השם נשאר לשם תאימות עם הקוראים.
  const URL_MATCH = SUPPORTED_URL_MATCHES;
  try {
    const focused = await chrome.tabs.query({ url: URL_MATCH, active: true, lastFocusedWindow: true });
    if (focused.length) return focused[0];
  } catch (e) { /* ממשיכים לאפשרות הבאה */ }
  try {
    const active = await chrome.tabs.query({ url: URL_MATCH, active: true });
    if (active.length) return active[0];
  } catch (e) { /* ממשיכים */ }
  const any = await chrome.tabs.query({ url: URL_MATCH });
  return any[0] || null;
}

// הזרקת פרומפט מתוזמנת.
//
// המאזין הזה היה קיים בלי שום צד שיוצר התראות - alarms.create לא הופיע בשום
// מקום בקוד - כלומר הפיצ'ר לא יכול היה לפעול. הצד החסר נבנה כאן.
const SCHEDULE_PREFIX = 'inject_prompt_';

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(SCHEDULE_PREFIX)) return;

  const data = await chrome.storage.local.get(alarm.name);
  const entry = data[alarm.name];
  const promptText = typeof entry === 'string' ? entry : (entry && entry.text);
  if (!promptText) return;

  try {
    let tab = await pickGeminiTab();

    // אין לשונית פתוחה: פותחים אחת וממתינים שה-content script יעלה. קודם
    // ההתראה נמחקה גם במקרה הזה, כלומר הפרומפט המתוזמן נעלם בלי זכר.
    if (!tab) {
      tab = await chrome.tabs.create({ url: 'https://gemini.google.com/app', active: false });
      await new Promise((r) => setTimeout(r, 6000));
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'INJECT_PROMPT', text: promptText });
    await chrome.storage.local.remove(alarm.name);
  } catch (e) {
    // ההזרקה נכשלה - משאירים את הרשומה ומנסים שוב בעוד דקה, במקום לאבד אותה.
    console.warn('[GemMCP] הזרקה מתוזמנת נכשלה, מנסה שוב:', e && e.message);
    chrome.alarms.create(alarm.name, { delayInMinutes: 1 });
  }
});

// יצירה, רשימה וביטול של הזרקות מתוזמנות. זה הצד שהיה חסר.
async function scheduleInjection(text, minutes) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('אין טקסט לתזמון.');

  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins < 1 || mins > 60 * 24 * 30) {
    throw new Error('הזמן חייב להיות בין דקה אחת ל-30 יום.');
  }

  // אין Math.random כאן בכוונה: המזהה נגזר מהזמן וממונה, כדי שיהיה יציב וניתן לניפוי.
  const store = await chrome.storage.local.get(['scheduleSeq']);
  const seq = (Number(store.scheduleSeq) || 0) + 1;
  const name = SCHEDULE_PREFIX + seq;
  const runAt = Date.now() + mins * 60000;

  await chrome.storage.local.set({
    scheduleSeq: seq,
    [name]: { text: clean, runAt, createdAt: Date.now() }
  });
  chrome.alarms.create(name, { when: runAt });
  return { name, runAt };
}

async function listInjections() {
  const alarms = await chrome.alarms.getAll();
  const mine = alarms.filter((a) => a.name.startsWith(SCHEDULE_PREFIX));
  const store = await chrome.storage.local.get(mine.map((a) => a.name));
  return mine.map((a) => {
    const e = store[a.name];
    return {
      name: a.name,
      runAt: a.scheduledTime,
      text: (typeof e === 'string' ? e : (e && e.text)) || ''
    };
  }).sort((x, y) => x.runAt - y.runAt);
}

async function cancelInjection(name) {
  if (!String(name || '').startsWith(SCHEDULE_PREFIX)) throw new Error('מזהה לא חוקי.');
  await chrome.alarms.clear(name);
  await chrome.storage.local.remove(name);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GemMCP] Extension installed & background service worker active');
  
  chrome.contextMenus.create({
    id: "send-to-gemmcp",
    title: "שלח ל-GemMCP",
    contexts: ["selection", "page", "image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "send-to-gemmcp") {
    let content = info.selectionText || info.srcUrl || info.pageUrl;
    if (!content) return;
    
    const promptText = `בבקשה נתח/שמור את התוכן הבא מהרשת:\n\n${content}`;
    
    // Find Gemini tab
    const picked = await pickGeminiTab();
    let geminiTabId = null;
    if (picked) {
      geminiTabId = picked.id;
      await chrome.tabs.update(geminiTabId, { active: true });
    } else {
      const newTab = await chrome.tabs.create({ url: "https://gemini.google.com/app" });
      geminiTabId = newTab.id;
      // Wait for tab to load before sending message
      await new Promise(r => setTimeout(r, 4000));
    }
    
    chrome.tabs.sendMessage(geminiTabId, { type: 'INJECT_PROMPT', text: promptText }).catch(err => {
      console.warn("Could not inject prompt directly", err);
    });
  }
});


async function saveAuditLog(service, action, requestPayload, responsePayload) {
  try {
    const data = await chrome.storage.local.get({ audit_logs: [] });
    const logs = data.audit_logs;
    logs.unshift({
      timestamp: Date.now(),
      service,
      action,
      request: requestPayload,
      response: responsePayload
    });
    // Keep only last 50
    if (logs.length > 50) logs.length = 50;
    await chrome.storage.local.set({ audit_logs: logs });
  } catch(e) {}
}

const NOTION_CLIENT_ID = '3bcd872b-594c-811c-8b80-0037d2a8c87a';
const NOTION_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

const GITHUB_CLIENT_ID = 'Ov23liOnkmB3tYpaHe6D';
const GITHUB_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

const CLOUD_OAUTH_ENDPOINT = 'https://iqakletdnmpsadznynnv.supabase.co/functions/v1/oauth-exchange';
const LOCAL_OAUTH_ENDPOINT = 'http://localhost:3000/api/oauth/exchange';

// גרסת הפרוטוקול בין התוסף לגשר. אם הגשר מדווח גרסה אחרת, הפורמטים עלולים
// לא להתאים - עדיף להיכשל בקול מאשר בשקט.
const BRIDGE_PROTOCOL_VERSION = 1;

// טוקן האימות של הגשר. אופציונלי: נאכף רק אם הוגדר BRIDGE_AUTH_TOKEN ב-.env
// של השרת. אם הוגדר, אותו ערך צריך להיות בשדה "טוקן אימות הגשר" בהגדרות התוסף.
async function getBridgeToken() {
  // local ולא sync: זו סיסמה למכונה הזו בלבד. הקריאה מ-sync נשארת כגיבוי
  // עבור מי שכבר שמר טוקן לפני המעבר.
  const local = await chrome.storage.local.get(['bridgeToken']);
  if (local && typeof local.bridgeToken === 'string' && local.bridgeToken.trim()) {
    return local.bridgeToken.trim();
  }
  const synced = await chrome.storage.sync.get(['bridgeToken']);
  return typeof synced.bridgeToken === 'string' ? synced.bridgeToken.trim() : '';
}

async function buildBridgeHeaders(extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const token = await getBridgeToken();
  if (token) headers['x-bridge-token'] = token;
  headers['x-gemmcp-protocol'] = String(BRIDGE_PROTOCOL_VERSION);
  return headers;
}

// החלפת קוד OAuth בטוקן.
//
// במקור נוסה קודם CLOUD_OAUTH_ENDPOINT - פונקציית Edge בפרויקט Supabase של מחבר
// הפרויקט, לא של המשתמש. משמעות הדבר היא שקוד ההרשאה של חשבון ה-GitHub/Notion/
// Supabase של המשתמש, והטוקן שחוזר, עברו דרך שרת של צד שלישי - למרות שהגשר
// המקומי מממש את אותה החלפה בעצמו. כאן ההחלפה נעשית מקומית בלבד.
//
// מי שכן רוצה את מסלול הענן צריך להפעיל אותו במפורש בהגדרות התוסף.
async function performOAuthExchange(service, code, redirectUri) {
  const { allowCloudOAuth } = await chrome.storage.sync.get(['allowCloudOAuth']);

  const localRes = await fetch(LOCAL_OAUTH_ENDPOINT, {
    method: 'POST',
    headers: await buildBridgeHeaders(),
    body: JSON.stringify({ service, code, redirectUri })
  }).catch((e) => {
    throw new Error(
      `לא ניתן להגיע לשרת הגשר המקומי לביצוע החלפת ה-OAuth (${e.message}). ` +
      'ודא ש-start-bridge.bat רץ.'
    );
  });

  if (localRes.ok) return await localRes.json();

  const err = await localRes.json().catch(() => ({}));

  // מסלול ענן, רק בהסכמה מפורשת של המשתמש
  if (allowCloudOAuth === true) {
    console.warn('[GemMCP] Local OAuth exchange failed, user opted into the cloud endpoint.');
    const cloudRes = await fetch(CLOUD_OAUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, code, redirectUri })
    });
    if (cloudRes.ok) {
      const data = await cloudRes.json();
      if (data.success || data.accessToken) return data;
    }
  }

  throw new Error(err.error || 'החלפת ה-OAuth נכשלה בשרת המקומי.');
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
          const activeServices = storedActive.activeServices || ['fetch', 'windows'];
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
          const activeServices = storedActive.activeServices || ['fetch', 'windows'];
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
          const activeServices = storedActive.activeServices || ['fetch', 'windows'];
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

// תפיסת פקודה לביצוע, משותפת לכל הלשוניות.
//
// עד עכשיו רשימת הפקודות שכבר טופלו הייתה Set בזיכרון של כל content script
// בנפרד. שתי לשוניות פתוחות על אותה שיחה סרקו את אותו בלוק JSON ושתיהן ירו -
// כלומר מחיקה או העתקה בוצעו פעמיים. עם Auto-Run דלוק זה קורה בלי שנשאלת.
//
// ה-service worker הוא נקודת הסנכרון היחידה שכל הלשוניות רואות. chrome.storage
// .session נשמר גם אם ה-worker נרדם, ומתאפס בסגירת הדפדפן - בדיוק תוחלת החיים
// הנכונה לרשימה כזו.
// התפיסה נועדה למנוע משתי לשוניות לבצע את אותה פקודה באותו רגע, וחלון
// המרוץ הזה הוא שניות. שש שעות הפכו אותה בפועל לחסימה של בקשה חוזרת:
// אותה פקודה באותה שיחה לא רצה שוב עד סוף היום, בלי שום הודעה. המפתח
// משוחרר במפורש בסיום, וה-TTL נשאר רק כרשת ביטחון למקרה שהשחרור אבד.
const CLAIM_TTL_MS = 10 * 60 * 1000;
const CLAIM_MAX = 500;

// שתי בקשות מקבילות היו שתיהן קוראות לפני שאחת מהן כותבת, ואז שתיהן היו
// "ראשונות". שרשור ההבטחות הופך את התפיסה לאטומית.
let claimChain = Promise.resolve();

// משוחרר דרך אותה שרשרת הבטחות שהתפיסה משתמשת בה, כדי ששחרור וקריאה
// מקבילה לא ידרסו זה את זה.
function releaseToolCall(key) {
  const run = async () => {
    if (!key) return;
    const store = await chrome.storage.session.get(['claimedCalls']);
    const claimed = store.claimedCalls || {};
    if (!Object.prototype.hasOwnProperty.call(claimed, key)) return;
    delete claimed[key];
    await chrome.storage.session.set({ claimedCalls: claimed });
  };
  claimChain = claimChain.then(run, run);
  return claimChain;
}

function claimToolCall(key) {
  const run = async () => {
    const store = await chrome.storage.session.get(['claimedCalls']);
    const claimed = store.claimedCalls || {};
    const now = Date.now();

    for (const [k, ts] of Object.entries(claimed)) {
      if (now - ts > CLAIM_TTL_MS) delete claimed[k];
    }
    if (Object.prototype.hasOwnProperty.call(claimed, key)) return false;

    claimed[key] = now;
    const keys = Object.keys(claimed);
    if (keys.length > CLAIM_MAX) {
      keys.sort((a, b) => claimed[a] - claimed[b])
          .slice(0, keys.length - CLAIM_MAX)
          .forEach((k) => delete claimed[k]);
    }
    await chrome.storage.session.set({ claimedCalls: claimed });
    return true;
  };
  claimChain = claimChain.then(run, run);
  return claimChain;
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // תפיסת פקודה: הלשונית הראשונה שמבקשת מקבלת true, כל השאר false.
  if (request.action === 'CLAIM_TOOL_CALL') {
    claimToolCall(String(request.key || ''))
      .then((ok) => sendResponse({ claimed: ok }))
      .catch(() => sendResponse({ claimed: true }));   // בכשל, לא חוסמים ביצוע לגיטימי
    return true;
  }

  // שחרור אחרי שהפקודה הסתיימה - בהצלחה, בשגיאה או בדחייה. בלעדיו המפתח
  // נשאר תפוס והבקשה הבאה הזהה לו נבלעת בשקט.
  if (request.action === 'RELEASE_TOOL_CALL') {
    releaseToolCall(String(request.key || ''))
      .then(() => sendResponse({ released: true }))
      .catch(() => sendResponse({ released: false }));
    return true;
  }


  // התוסף רשאי לקרוא כל דף (Web Fetch), אבל הוראות ביצוע מתקבלות אך ורק
  // מהלשונית של ג'מיני. הרשאת קריאה רחבה והרשאת פקודה הן שני דברים שונים,
  // וזו ההפרדה שמחזיקה את זה: מה שקוראים מדף אקראי לעולם אינו פקודה.
  if (request.action === 'SCHEDULE_INJECTION') {
    scheduleInjection(request.text, request.minutes)
      .then((r) => sendResponse({ success: true, data: r }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'LIST_INJECTIONS') {
    listInjections()
      .then((items) => sendResponse({ success: true, data: items }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'CANCEL_INJECTION') {
    cancelInjection(request.name)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // ביטול התקנה. עובר דרך ה-service worker כמו כל פנייה לגשר: מדיניות
  // Local Network Access חוסמת גישה ל-localhost מהקשר הדף.
  if (request.action === 'CANCEL_INSTALL') {
    (async () => {
      try {
        const res = await fetch('http://127.0.0.1:3000/api/windows/install/cancel', {
          method: 'POST',
          headers: { ...(await buildBridgeHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: request.jobId })
        });
        sendResponse(await res.json());
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // הזרמת חלקי תגובה של שאילתת API מה-content script לגשר
  if (request.action === 'AGENT_STREAM_CHUNK') {
    (async () => {
      try {
        await fetch('http://127.0.0.1:3000/api/agent/stream-chunk', {
          method: 'POST',
          headers: { ...(await buildBridgeHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: request.jobId, chunk: request.chunk })
        });
      } catch (e) {}
    })();
    return false;
  }

  // השלמת שאילתת API מה-content script לגשר
  if (request.action === 'AGENT_QUERY_COMPLETE') {
    (async () => {
      try {
        await fetch('http://127.0.0.1:3000/api/agent/complete', {
          method: 'POST',
          headers: { ...(await buildBridgeHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: request.jobId, text: request.text, error: request.error })
        });
      } catch (e) {}
    })();
    return false;
  }

  // בדיקת משימות API יזומה מ-content script (Heartbeat)
  if (request.action === 'TRIGGER_AGENT_POLL') {
    checkPendingAgentJobs();
    sendResponse({ ok: true });
    return false;
  }

  // האתרים שמהם מתקבלות הוראות ביצוע. הרשאת הקריאה של התוסף רחבה יותר
  // (Web Fetch קורא כל דף), אבל הוראה לבצע פעולה במחשב מתקבלת רק מכאן.
  if (request.action === 'EXECUTE_MCP_TOOL') {
    const from = sender && sender.tab && sender.tab.url;
    if (!isSupportedOrigin(from)) {
      console.warn('[GemMCP] בקשת ביצוע נדחתה. מקור:', from);
      sendResponse({ success: false, error: 'בקשת ביצוע התקבלה ממקור שאינו לשונית נתמכת ונדחתה.' });
      return true;
    }
    handleOmniToolExecution(request.service, request.toolCall, request.config)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message || err }));
    return true;
  }

  // מצב האימות מול הגשר. חייב לעבור דרך ה-service worker: content script פועל
  // בהקשר הרשת של הדף, ומדיניות Local Network Access חוסמת ממנו גישה ל-localhost.
  if (request.action === 'GET_BRIDGE_AUTH_STATE') {
    (async () => {
      try {
        const res = await fetch('http://127.0.0.1:3000/api/health', {
          headers: await buildBridgeHeaders()
        });
        const data = await res.json();
        sendResponse({
          success: true,
          reachable: true,
          authRequired: !!data.authRequired,
          authenticated: !!data.authenticated
        });
      } catch (e) {
        sendResponse({ success: true, reachable: false });
      }
    })();
    return true;
  }

  // שמירת טוקן ואימותו מיד, כדי שהמשתמש יקבל תשובה ולא ינחש
  if (request.action === 'SET_BRIDGE_TOKEN') {
    (async () => {
      const token = String(request.token || '').trim();
      await chrome.storage.local.set({ bridgeToken: token });
      try {
        const res = await fetch('http://127.0.0.1:3000/api/health', {
          headers: { 'x-bridge-token': token }
        });
        const data = await res.json();
        sendResponse({ success: true, authenticated: !!data.authenticated });
      } catch (e) {
        sendResponse({ success: false, error: 'לא ניתן להגיע לגשר.' });
      }
    })();
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

  // 🔄 הפעלת עדכון אוטומטי מלא דרך שרת ה-Bridge
  if (request.action === 'TRIGGER_BRIDGE_UPDATE') {
    triggerBridgeUpdate()
      .then((res) => sendResponse({ success: true, data: res }))
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
 * 🔄 הרצת עדכון אוטומטי מלא דרך שרת ה-Bridge
 */
async function triggerBridgeUpdate() {
  // הגרסה הקודמת של הפונקציה הזו זרקה תמיד, כי ה-endpoint שהיא קראה אליו
  // הוסר בצדק. הוא חזר בצורה אחרת: מאגר מקובע בקוד, אימות sha256 מול
  // החתימה שהפרסום נושא, גיבוי לפני החלפה, ושום הרצה של תוכן הארכיון.
  const res = await fetch('http://127.0.0.1:3000/api/update/apply', {
    method: 'POST',
    headers: await buildBridgeHeaders(),
    body: JSON.stringify({})
  });
  const json = await res.json();
  if (!json || !json.success) throw new Error((json && json.error) || 'העדכון נכשל');
  return json.data;
}

/**
 * 🛑 כיבוי שרת ה-Bridge
 */
async function shutdownBridgeServer() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch('http://127.0.0.1:3000/api/shutdown', {
      method: 'POST',
      headers: await buildBridgeHeaders(),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      return 'שרת ה-Bridge כובה בהצלחה.';
    }
  } catch (e) {
    clearTimeout(timeoutId);
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
  if (s === 'windows_extra') return 'windows_extra';
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
  const activeServices = Array.isArray(config?.activeServices) ? config.activeServices : ['fetch', 'windows'];
  const srv = normalizeServiceName(service);
  const isActive = srv === 'custom' || srv.startsWith('custom_')
    ? (activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_')))
    : (srv === 'windows_extra' ? activeServices.includes('windows') : activeServices.includes(srv));

  if (!isActive) {
    throw new Error(`השירות [${service}] מנוטרל בהגדרות התוסף ולא יבוצע.`);
  }

  switch (srv) {
    case 'windows':
      return await executeWindowsMcp(toolCall, config);
    case 'windows_extra':
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
// הודעה קצרה ללשונית הפעילה. נכשלת בשקט כשאין לשונית מתאימה - זו הודעת
// התקדמות, ואין סיבה שהיא תפיל פעולה.
function notifyTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true })
    .then((tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    })
    .catch(() => {});
}

async function executeWindowsMcp(toolCall, config) {
  // מתג ההשהיה. בלי הבדיקה הזו הוא היה תווית בלבד: הפעולה הבאה מעירה את
  // הגשר דרך gemmcp:// תוך שניות, ו"כבוי" לא היה אומר כלום.
  try {
    const nap = await chrome.storage.sync.get(['bridgeAsleep']);
    if (nap && nap.bridgeAsleep) {
      throw new Error(
        'התוסף מושהה כרגע. כדי להפעיל אותו שוב, כבה את מתג ההשהיה בפופאפ.'
      );
    }
  } catch (e) {
    // שגיאת אחסון אינה סיבה לחסום; שגיאת ההשהיה עצמה כן ממשיכה החוצה.
    if (e && typeof e.message === 'string' && e.message.indexOf('מושהה') !== -1) throw e;
  }
  // תוכנית מרובת שלבים נשלחת ל-endpoint אחר, שמריץ את השלבים ברצף ומעביר
  // ערכים ביניהם בצד השרת - במקום סבב שלם בצ'אט לכל שלב.
  const isPlan = Array.isArray(toolCall.plan) && toolCall.plan.length > 0;
  const bridgeUrl = isPlan
    ? 'http://127.0.0.1:3000/api/windows/plan'
    : 'http://127.0.0.1:3000/api/windows/execute';
  
  // חילוץ פעולה ופרמטרים
  let action = toolCall.action || toolCall.tool_name || 'read_file';
  if (action.startsWith('windows:')) {
    action = action.replace('windows:', '');
  }

  const permissionsBlock = {
    readFiles: config?.winPermissions?.readFiles ?? true,
    writeFiles: config?.winPermissions?.writeFiles ?? false,
    runCommands: config?.winPermissions?.runCommands ?? false,
    launchApps: config?.winPermissions?.launchApps ?? true,
    clipboard: config?.winPermissions?.clipboard ?? true,
    allowedPath: config?.winAllowedPath || null,
    readScope: config?.winPermissions?.readScope ?? 'desktop',
    allowInstall: config?.winPermissions?.allowInstall ?? false
  };

  if (isPlan) {
    const planPayload = { plan: toolCall.plan, permissions: permissionsBlock };
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: await buildBridgeHeaders(),
      body: JSON.stringify(planPayload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data?.error || `שגיאת שרת מקומי (${res.status})`);
      err.partial = data?.partial || null;
      throw err;
    }
    return data.data;
  }

  const incomingParams = (toolCall.params && typeof toolCall.params === 'object') ? toolCall.params : toolCall;
  const mergedParams = { ...incomingParams };
  delete mergedParams.action;
  delete mergedParams.tool_name;
  delete mergedParams.tool;
  delete mergedParams.service;
  delete mergedParams.plan;

  if (toolCall.command || toolCall.cmd) mergedParams.command = toolCall.command || toolCall.cmd;
  if (toolCall.app_name || toolCall.app) mergedParams.app_name = toolCall.app_name || toolCall.app;
  if (toolCall.path || toolCall.file) mergedParams.path = toolCall.path || toolCall.file;
  if (toolCall.content !== undefined) mergedParams.content = toolCall.content;
  if (toolCall.text !== undefined) mergedParams.text = toolCall.text;

  const payload = {
    action: action,
    params: mergedParams,
    permissions: {
      readFiles: config?.winPermissions?.readFiles ?? true,
      writeFiles: config?.winPermissions?.writeFiles ?? false,
      runCommands: config?.winPermissions?.runCommands ?? false,
      launchApps: config?.winPermissions?.launchApps ?? true,
      clipboard: config?.winPermissions?.clipboard ?? true,
      allowedPath: config?.winAllowedPath || null,
      readScope: config?.winPermissions?.readScope ?? 'desktop',
      allowInstall: config?.winPermissions?.allowInstall ?? false
    }
  };

  async function tryFetchOnce(timeoutMs = 25000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: await buildBridgeHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        throw new Error(
          'הגשר דחה את הבקשה: טוקן אימות חסר או שגוי. ' +
          'ודא שהערך בשדה "טוקן אימות הגשר" תואם ל-BRIDGE_AUTH_TOKEN ב-.env של השרת.'
        );
      }

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
    return await tryFetchOnce(25000);
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

    // 3. המתנה להתעוררות השרת.
    //
    // החלון היה שש שניות, וזה פשוט לא הספיק: מדדתי את השרשרת המלאה -
    // wscript, cmd, בדיקת תלויות, netstat ועליית node - בין שמונה לשתים
    // עשרה שניות. כלומר ההפעלה האוטומטית "נכשלה" תמיד, והמשתמש הוסק
    // שצריך להפעיל את השרת ידנית בעוד הוא עלה מצוין רגע אחרי הוויתור.
    //
    // שלושים שניות הן רווח נשימה ולא ציפייה: בהרצה רגילה זה נגמר תוך
    // שמונה, ורק התקנה ראשונה שמריצה npm install לוקחת יותר.
    const startTime = Date.now();
    let serverReady = false;
    let announced = false;

    while (Date.now() - startTime < 30000) {
      await new Promise(r => setTimeout(r, 600));
      // אחרי ארבע שניות זה כבר לא נראה כמו רגע - אומרים למשתמש מה קורה.
      if (!announced && Date.now() - startTime > 4000) {
        announced = true;
        notifyTab({ type: 'BRIDGE_STARTING' });
      }
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
      return await tryFetchOnce(25000);
    }

    throw new Error(
      'שרת ה-Bridge לא עלה תוך 30 שניות. אם זו התקנה חדשה, הרץ פעם אחת את ' +
      'register-protocol.bat שבתיקיית GemMCP - בלעדיו התוסף אינו יכול להעיר ' +
      'את השרת בעצמו. אחרת הפעל את start-bridge.bat ידנית.'
    );
  }
}

/**
 * ⚡ ביצוע שאילתה ב-Supabase
 */
// ---------------------------------------------------------------------------
// שער בטיחות לשאילתות SQL שהמודל מייצר.
//
// כברירת מחדל מותרות רק שאילתות קריאה. כתיבה דורשת סימון מפורש בהגדרות התוסף
// (supabaseAllowWrites). זו רשימת היתר ולא רשימת חסימה: רשימת חסימה מפספסת כל
// ניסוח שלא נמצא בה, וגם חוסמת שאילתות תמימות שמכילות מילה מהרשימה.
// ---------------------------------------------------------------------------
const SQL_READ_ONLY_STARTS = ['SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'TABLE', 'VALUES'];
const SQL_ALWAYS_BLOCKED = [
  /\bDROP\s+(DATABASE|SCHEMA|ROLE|USER|TABLE|VIEW|FUNCTION)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\b(GRANT|REVOKE)\b/i,
  /\b(CREATE|ALTER|DROP)\s+USER\b/i,
  /\bAUTH\.USERS\b/i,
  /\bPG_(SHADOW|AUTHID)\b/i,
  /\bexec_sql\s*\(/i          // קריאה לפונקציה עצמה עוקפת את בדיקת מילת הפתיחה
];

function assertSafeSql(query, config) {
  if (!query || !query.trim()) throw new Error('שאילתת SQL ריקה');

  // מנטרלים מחרוזות ואז מסירים הערות, כך שהערה בתוך מחרוזת לא תבלבל את הניתוח
  const neutralised = query
    .replace(/'([^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''")
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  for (const pattern of SQL_ALWAYS_BLOCKED) {
    if (pattern.test(neutralised)) {
      throw new Error('השאילתה נחסמה: היא כוללת פעולה הרסנית או שינוי הרשאות.');
    }
  }

  if (/;\s*\S/.test(neutralised)) {
    throw new Error('אין לשלוח יותר מפקודת SQL אחת בבקשה.');
  }

  const first = (neutralised.trim().match(/^\(*\s*([A-Za-z]+)/) || [])[1] || '';
  if (!SQL_READ_ONLY_STARTS.includes(first.toUpperCase()) && config?.supabaseAllowWrites !== true) {
    throw new Error(
      `שאילתות כתיבה חסומות (הפקודה מתחילה ב-'${first || '?'}'). ` +
      'ניתן לאפשר כתיבה בהגדרות התוסף, בכרטיס Supabase.'
    );
  }

  return query;
}

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

  // הסינון חייב לקרות כאן. הבקשה הזו נשלחת ישירות מה-service worker ל-Supabase
  // ואינה עוברת דרך שרת הגשר, ולכן הבדיקה שקיימת ב-server.js אינה חלה עליה כלל.
  query = assertSafeSql(query, config);

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
      let decodedContent = '';
      try {
        const binStr = atob(data.content.replace(/\s/g, ''));
        const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
        decodedContent = new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        decodedContent = atob(data.content.replace(/\s/g, ''));
      }
      return {
        path: data.path,
        size: data.size,
        content: decodedContent
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

  // ---------------------------------------------------------------------------
  // עוזר משותף. בלעדיו כל פעולה חוזרת על אותן שש שורות של fetch, בדיקת
  // סטטוס וחילוץ הודעת השגיאה - ואז אחת מהן שוכחת את הבדיקה.
  // ---------------------------------------------------------------------------
  async function gh(pathname, options) {
    const opts = options || {};
    const res = await fetch(`https://api.github.com${pathname}`, {
      method: opts.method || 'GET',
      headers: opts.body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // ההודעה של GitHub מסבירה בדיוק מה חסר - למשל אילו הרשאות אין לטוקן -
      // ולכן היא שווה הרבה יותר מ-statusText.
      throw new Error(`GitHub (${res.status}): ${err.message || res.statusText}`);
    }
    if (res.status === 204) return { ok: true };
    return await res.json();
  }

  function needRepo(repo) {
    if (!repo || !String(repo).includes('/')) {
      throw new Error('חסר שם מאגר בפורמט owner/name');
    }
    return String(repo);
  }

  if (action === 'get_repo' || action === 'github:get_repo') {
    const r = await gh(`/repos/${needRepo(toolCall.repo)}`);
    return {
      full_name: r.full_name, description: r.description, private: r.private,
      default_branch: r.default_branch, stars: r.stargazers_count, forks: r.forks_count,
      open_issues: r.open_issues_count, url: r.html_url, updated_at: r.updated_at
    };
  }

  if (action === 'list_issues' || action === 'github:list_issues') {
    const state = toolCall.state || 'open';
    const rows = await gh(`/repos/${needRepo(toolCall.repo)}/issues?state=${encodeURIComponent(state)}&per_page=20`);
    return rows
      .filter((i) => !i.pull_request)   // GitHub מחזיר גם PRs בנתיב הזה
      .map((i) => ({ number: i.number, title: i.title, state: i.state,
                     author: i.user && i.user.login, comments: i.comments, url: i.html_url }));
  }

  if (action === 'list_commits' || action === 'github:list_commits') {
    const rows = await gh(`/repos/${needRepo(toolCall.repo)}/commits?per_page=15`);
    return rows.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: (c.commit.message || '').split('\n')[0],
      author: c.commit.author && c.commit.author.name,
      date: c.commit.author && c.commit.author.date,
      url: c.html_url
    }));
  }

  if (action === 'list_branches' || action === 'github:list_branches') {
    const rows = await gh(`/repos/${needRepo(toolCall.repo)}/branches?per_page=50`);
    return rows.map((b) => ({ name: b.name, protected: b.protected }));
  }

  if (action === 'list_prs' || action === 'github:list_prs') {
    const state = toolCall.state || 'open';
    const rows = await gh(`/repos/${needRepo(toolCall.repo)}/pulls?state=${encodeURIComponent(state)}&per_page=20`);
    return rows.map((p) => ({ number: p.number, title: p.title, state: p.state,
                              author: p.user && p.user.login, draft: p.draft,
                              base: p.base && p.base.ref, head: p.head && p.head.ref, url: p.html_url }));
  }

  if (action === 'create_or_update_file' || action === 'github:create_or_update_file') {
    const repo = needRepo(toolCall.repo);
    const { path: filePath, content, message, branch } = toolCall;
    if (!filePath || content === undefined) throw new Error('חסר path או content');

    // עדכון קובץ קיים דורש את ה-sha שלו. בלעדיו GitHub מחזיר 422 שנראה
    // כמו שגיאת הרשאה ואינו מסביר שהקובץ פשוט כבר קיים.
    let sha = toolCall.sha || '';
    if (!sha) {
      try {
        const existing = await gh(`/repos/${repo}/contents/${filePath}` + (branch ? `?ref=${encodeURIComponent(branch)}` : ''));
        if (existing && existing.sha) sha = existing.sha;
      } catch (e) { /* לא קיים - יצירה חדשה */ }
    }

    const bytes = new TextEncoder().encode(String(content));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });

    const body = { message: message || `Update ${filePath}`, content: btoa(bin) };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;

    const out = await gh(`/repos/${repo}/contents/${filePath}`, { method: 'PUT', body });
    return {
      message: sha ? `הקובץ '${filePath}' עודכן` : `הקובץ '${filePath}' נוצר`,
      path: filePath,
      commit: out.commit && out.commit.sha,
      url: out.content && out.content.html_url
    };
  }

  if (action === 'delete_repo_file' || action === 'github:delete_repo_file') {
    const repo = needRepo(toolCall.repo);
    const { path: filePath, message, branch } = toolCall;
    if (!filePath) throw new Error('חסר path');
    const existing = await gh(`/repos/${repo}/contents/${filePath}` + (branch ? `?ref=${encodeURIComponent(branch)}` : ''));
    if (!existing || !existing.sha) throw new Error(`הקובץ '${filePath}' לא נמצא במאגר`);
    const body = { message: message || `Delete ${filePath}`, sha: existing.sha };
    if (branch) body.branch = branch;
    await gh(`/repos/${repo}/contents/${filePath}`, { method: 'DELETE', body });
    return { message: `הקובץ '${filePath}' נמחק מ-${repo}` };
  }

  if (action === 'create_pull_request' || action === 'github:create_pull_request') {
    const repo = needRepo(toolCall.repo);
    const { title, head, base, body } = toolCall;
    if (!title || !head || !base) throw new Error('חסר title, head או base');
    const pr = await gh(`/repos/${repo}/pulls`, { method: 'POST', body: { title, head, base, body: body || '' } });
    return { number: pr.number, title: pr.title, url: pr.html_url, state: pr.state };
  }

  if (action === 'comment_issue' || action === 'github:comment_issue') {
    const repo = needRepo(toolCall.repo);
    const { number, body } = toolCall;
    if (!number || !body) throw new Error('חסר number או body');
    const c = await gh(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } });
    return { url: c.html_url, created_at: c.created_at };
  }

  if (action === 'close_issue' || action === 'github:close_issue') {
    const repo = needRepo(toolCall.repo);
    const { number } = toolCall;
    if (!number) throw new Error('חסר number');
    const i = await gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'closed' } });
    return { number: i.number, state: i.state, url: i.html_url };
  }

  // מחיקת מאגר היא בלתי הפיכה, והטוקן של התוסף לרוב אינו מורשה לה בכלל
  // (נדרש scope 'delete_repo'). המסלול המעשי הוא github_cli, שרץ עם החשבון
  // שכבר מחובר במחשב - אבל ההודעה חייבת להסביר את זה במקום להחזיר 403 סתום.
  if (action === 'delete_repo' || action === 'github:delete_repo') {
    const repo = needRepo(toolCall.repo);
    try {
      await gh(`/repos/${repo}`, { method: 'DELETE' });
      return { message: `המאגר '${repo}' נמחק.` };
    } catch (e) {
      if (String(e.message).includes('403')) {
        throw new Error(
          `לטוקן של התוסף אין הרשאת delete_repo. אפשר למחוק דרך ה-gh שמחובר במחשב: ` +
          `{"service":"windows","action":"github_cli","args":["repo","delete","${repo}","--yes"]}`
        );
      }
      throw e;
    }
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
  if (!targetUrl) throw new Error('חובה לספק URL או כותרת חלון לחיפוש');

  // SSRF Protection
  try {
    const urlObj = new URL(targetUrl);
    const host = urlObj.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.startsWith('169.254.') || host.startsWith('192.168.') || host.startsWith('10.')) {
      throw new Error('אבטחה: הגישה לכתובות רשת פנימיות דרך Web Fetch נחסמה (SSRF Protection).');
    }
  } catch (e) {
    if (e.message.includes('אבטחה:')) throw e;
    // URL parsing failed, assume it's invalid or missing protocol
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
  }

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
      // שולחים את הטוקן גם בבדיקת הבריאות. /api/health פתוח, ולכן בלי זה
      // המצב היה מוצג כ"מחובר" גם עם טוקן שגוי, והמשתמש היה מגלה את זה רק
      // כשפקודה אמיתית נכשלת.
      const res = await fetch('http://127.0.0.1:3000/api/health', {
        headers: await buildBridgeHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Bridge Server response status: ${res.status}`);
      const data = await res.json();

      if (data.authRequired && !data.authenticated) {
        throw new Error(
          'שרת ה-Bridge פועל אך הטוקן חסר או שגוי. ' +
          'הגדר את אותו ערך של BRIDGE_AUTH_TOKEN בשדה "טוקן אימות הגשר" בהגדרות התוסף.'
        );
      }

      if (data.protocol && data.protocol !== BRIDGE_PROTOCOL_VERSION) {
        throw new Error(
          `אי התאמת גרסאות: השרת מדבר פרוטוקול ${data.protocol} והתוסף ${BRIDGE_PROTOCOL_VERSION}. ` +
          'עדכן את שניהם מאותו מקור.'
        );
      }

      const scope = data.permissions?.allowedPath === '*' ? 'כל הדיסק' : data.permissions?.allowedPath;
      return `שרת Windows Bridge פועל ומאומת. נתיב מותר: ${scope || 'לא ידוע'}`;
    } catch (e) {
      // שגיאות אימות וגרסה הן מפורשות - לא להחליף אותן בהודעה גנרית על Node חסר
      if (e && /טוקן|פרוטוקול/.test(e.message || '')) throw e;
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

// ---------------------------------------------------------------------------
// 🤖 Agent Worker Loop - עיבוד בקשות API נכנסות מ-Bridge Server
// ---------------------------------------------------------------------------

let isAgentWorkerRunning = false;

let isCheckingJobs = false;

async function checkPendingAgentJobs() {
  if (isCheckingJobs) return;
  isCheckingJobs = true;
  try {
    const res = await fetch('http://127.0.0.1:3000/api/agent/pending', {
      headers: await buildBridgeHeaders()
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.hasJob && data.job) {
        processAgentJob(data.job);
      }
    }
  } catch (e) {
  } finally {
    isCheckingJobs = false;
  }
}

async function startAgentApiWorker() {
  if (isAgentWorkerRunning) return;
  isAgentWorkerRunning = true;

  console.log('[GemMCP Agent] API worker started.');

  while (true) {
    await checkPendingAgentJobs();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function getTargetForModel(modelName) {
  const m = String(modelName || '').toLowerCase().trim();
  if (m.includes('claude') || m.includes('anthropic') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) {
    return {
      type: 'claude',
      name: 'Claude',
      urlMatches: ['https://claude.ai/*'],
      openUrl: 'https://claude.ai/new'
    };
  }
  if (m.includes('gpt') || m.includes('chatgpt') || m.includes('openai') || m.includes('o1') || m.includes('o3')) {
    return {
      type: 'chatgpt',
      name: 'ChatGPT',
      urlMatches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      openUrl: 'https://chatgpt.com/'
    };
  }
  if (m.includes('gemini') || m.includes('google') || m.includes('flash') || m.includes('pro')) {
    return {
      type: 'gemini',
      name: 'Gemini',
      urlMatches: ['https://gemini.google.com/*'],
      openUrl: 'https://gemini.google.com/app'
    };
  }
  // ברירת מחדל: כל אתר נתמך פתוח, או ג'מיני אם אין כרטיסייה פתוחה
  return {
    type: 'auto',
    name: 'Auto',
    urlMatches: SUPPORTED_URL_MATCHES,
    openUrl: 'https://gemini.google.com/app'
  };
}

// ניהול כרטיסיות ייעודיות ונפרדות עבור סשנים של ה-API
// מונע השתלטות על כרטיסיות שבהן המשתמש עובד באופן אינטראקטיבי בדפדפן
const apiDedicatedTabs = new Map(); // targetType -> tabId

chrome.tabs.onRemoved.addListener((closedTabId) => {
  for (const [type, tabId] of apiDedicatedTabs.entries()) {
    if (tabId === closedTabId) {
      apiDedicatedTabs.delete(type);
      console.log(`[GemMCP Agent] Dedicated API tab for ${type} (ID: ${closedTabId}) was closed.`);
    }
  }
});

async function waitForTabToLoadAndRespond(tabId, maxWaitMs = 12000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) return false;
      // אם הדף השלים טעינה, בודקים שה-content script פעיל ועונה
      if (tab.status === 'complete') {
        const pong = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { type: 'PING_CONTENT_SCRIPT' }, (res) => {
            if (chrome.runtime.lastError || !res) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        });
        if (pong) return true;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function getOrCreateDedicatedApiTab(target) {
  const targetType = target.type === 'auto' ? 'gemini' : target.type;
  const existingTabId = apiDedicatedTabs.get(targetType);

  // בדיקה אם הכרטיסייה הייעודית שנפתחה קודם ל-API עדיין קיימת ופעילה
  if (existingTabId) {
    try {
      const existingTab = await chrome.tabs.get(existingTabId).catch(() => null);
      if (existingTab && existingTab.id) {
        return { tab: existingTab, isNew: false };
      }
    } catch (e) {}
    apiDedicatedTabs.delete(targetType);
  }

  // פתיחת כרטיסייה חדשה וייעודית ברקע עבור ה-API (בלי להפריע לכרטיסיות המשתמש)
  console.log(`[GemMCP Agent] Opening new dedicated API tab for ${target.name} at: ${target.openUrl}`);
  const newTab = await chrome.tabs.create({ url: target.openUrl, active: false });
  apiDedicatedTabs.set(targetType, newTab.id);

  // המתנה קצרה לטעינה מלאה של הכרטיסייה וה-content script
  await waitForTabToLoadAndRespond(newTab.id, 10000);
  return { tab: newTab, isNew: true };
}

async function processAgentJob(job) {
  console.log('[GemMCP Agent] Processing job:', job.id, 'Model/Target:', job.model);
  const target = getTargetForModel(job.model);
  try {
    const { tab } = await getOrCreateDedicatedApiTab(target);
    if (!tab) {
      throw new Error(`לא ניתן היה ליצור כרטיסיית API ייעודית עבור ${target.name}`);
    }

    // שליחת השאילתה ל-content script בכרטיסיית ה-API הייעודית
    chrome.tabs.sendMessage(tab.id, {
      type: 'EXECUTE_AGENT_QUERY',
      jobId: job.id,
      prompt: job.prompt,
      stream: Boolean(job.stream),
      model: job.model,
      targetSite: target.name
    }).catch(async (err) => {
      console.warn(`[GemMCP Agent] Failed to send query to dedicated ${target.name} tab:`, err);
      // דיווח שגיאה חזרה לשרת ה-API
      await fetch('http://127.0.0.1:3000/api/agent/complete', {
        method: 'POST',
        headers: await buildBridgeHeaders(),
        body: JSON.stringify({ id: job.id, error: `לא ניתן לשלוח את השאילתה לכרטיסיית ${target.name}: ` + (err && err.message) })
      }).catch(() => {});
    });
  } catch (err) {
    await fetch('http://127.0.0.1:3000/api/agent/complete', {
      method: 'POST',
      headers: await buildBridgeHeaders(),
      body: JSON.stringify({ id: job.id, error: `שגיאה בהפעלת כרטיסיית ${target.name}: ` + (err && err.message) })
    }).catch(() => {});
  }
}

// הפעלת ה-Worker באופן מיידי
startAgentApiWorker();

