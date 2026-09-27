/**
 * GemMCP - Content Script for Google Gemini Web
 * מנהל את הווידג'ט הצף, זיהוי פקודות רב-שירותיות, והזרקת תוצאות אוטומטית
 */

(function () {
  // שורת "פעיל ומוכן" עברה ל-initExtension ולא נשארה כאן: היא מדפיסה את
  // SITE.name, ו-SITE הוא const שמוגדר בהמשך הקובץ. קריאה אליו מכאן נפלה
  // ב-TDZ (Cannot access 'SITE' before initialization) והפילה את כל ה-content
  // script כבר בשורה הראשונה - כך שהווידג'ט הצף לא נוצר בכלל.

  function showToast(message, type = 'info') {
    let container = document.getElementById('gemmcp-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'gemmcp-toast-container';
      container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { error: '#ef4444', success: '#22c55e', info: '#3b82f6' };
    toast.style.cssText = `background:${colors[type] || colors.info};color:white;padding:12px 20px;border-radius:8px;font-family:sans-serif;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.1);opacity:0;transition:opacity 0.3s ease, transform 0.3s ease;transform:translateY(20px);pointer-events:auto;max-width:300px;line-height:1.4;`;
    toast.textContent = message;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ברירת מחדל בטוחה: דורש אישור. במקור זה היה true, כך שכל אובדן של המפתח
  // autoExecute מ-chrome.storage (למשל הסרה והוספה מחדש של התוסף) החזיר בשקט
  // הרצה אוטומטית ללא אישור.
  let isAutoExecute = false;
  // היקף ההרצה האוטומטית: 'read' מריץ רק פעולות קריאה ועוצר על כל השאר,
  // 'all' מריץ הכל בלי לשאול. התקרה בשרת ותיחום התיקייה נאכפים בשני המצבים.
  let autoRunScope = 'read';
  // פועל רק בשיחות שהופעלו במפורש. ברירת המחדל דלוקה: התערבות בשיחה שלא
  // ביקשת בה כלום היא הפתעה, לא נוחות.
  let requireActivation = true;
  // ברירת המחדל היא השירותים שעובדים ללא שום הגדרה. supabase היה בברירת
  // המחדל למרות שהוא דורש URL ומפתח, בעוד windows - היחיד שעובד מיד - היה
  // כבוי, כך שאחרי התקנה נקייה הגשר נראה מנותק בלי סיבה נראית לעין.
  let activeServices = ['fetch', 'windows'];
  let connectedServices = ['fetch', 'windows'];
  let processedHashes = new Set();

  // המפתח של הפקודה שנמצאת כרגע בביצוע. גם processedHashes וגם רשימת
  // התפיסה שב-service worker נועדו למנוע ביצוע כפול של אותה פקודה בו-זמנית,
  // אבל אף אחד מהם לא שוחרר אי פעם: הראשון החזיק לנצח, והשני שש שעות.
  // התוצאה היא שבקשה חוזרת של אותה פקודה באותה שיחה - בקשה לגיטימית
  // לגמרי - נחסמה בשקט מוחלט, בלי שורת יומן ובלי שום סימן על המסך.
  let inFlightCallKey = null;

  function releaseCallKey() {
    const key = inFlightCallKey;
    inFlightCallKey = null;
    if (!key) return;
    processedHashes.delete(key);
    try {
      chrome.runtime.sendMessage({ action: 'RELEASE_TOOL_CALL', key }, () => {
        void chrome.runtime.lastError;   // שחרור שנכשל אינו שובר כלום
      });
    } catch (e) { /* ההקשר של התוסף נעלם - אין מה לשחרר */ }
  }
  let isExecuting = false;
  let logsContainer = null;
  let unreadErrors = 0;
  let customToolPrompts = {};

  // חישוב אילו שירותים באמת מחוברים (אותה לוגיקה כמו ה-Popup)
  function computeConnectedServices(data) {
    const connected = ['fetch', 'windows']; // תמיד זמינים: גלישה ברשת ו-MCP מקומי
    if (data.supabaseConnected || (data.supabaseUrl && data.supabaseKey)) connected.push('supabase');
    if (data.notionConnected || data.notionApiKey) connected.push('notion');
    if (data.githubConnected || data.githubToken) connected.push('github');
    
    const hasCustom = (Array.isArray(data.customServers) && data.customServers.some(s => s.enabled !== false && s.url)) ||
                      (data.customMcpUrl && String(data.customMcpUrl).trim());
    if (hasCustom) connected.push('custom');
    return connected;
  }

  const CONNECTION_KEYS = [
    'supabaseConnected', 'supabaseUrl', 'supabaseKey',
    'notionConnected', 'notionApiKey',
    'githubConnected', 'githubToken',
    'customMcpUrl', 'customServers',
    'customToolPrompts'
  ];

  // טעינת הגדרות שמורות
  // autoRunScope חייב להיות ברשימה, אחרת data.autoRunScope תמיד undefined
  // והמצב היה חוזר ל'בטוח' בכל טעינת דף במקום להישאר כפי שנבחר.
  chrome.storage.sync.get(['activeServices', 'autoExecute', 'autoRunScope', 'requireActivation', 'customServers', 'customToolPrompts', ...CONNECTION_KEYS], (data) => {
    connectedServices = computeConnectedServices(data);
    if (data.activeServices && Array.isArray(data.activeServices)) {
      activeServices = data.activeServices;
    }
    if (data.customToolPrompts && typeof data.customToolPrompts === 'object') {
      customToolPrompts = data.customToolPrompts;
    }
    // שירות שאינו מחובר לא יכול להיות פעיל
    activeServices = activeServices.filter(s => connectedServices.includes(s));
    if (typeof data.autoExecute !== 'undefined') {
      isAutoExecute = !!data.autoExecute;
    } else {
      isAutoExecute = false;
    }
    autoRunScope = data.autoRunScope === 'all' ? 'all' : 'read';
    requireActivation = data.requireActivation !== false;
    syncScopeChips();
    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    if (autoToggle) autoToggle.checked = isAutoExecute;
    // גם כאן, ולא רק בלחיצה ובשינוי אחסון: זה המסלול שרץ כשהדף נטען וההגדרה
    // כבר דלוקה מקודם. בלעדיו התיבה נראתה מסומנת בזמן שהאזהרה נשארה מוסתרת -
    // כלומר בדיוק במצב שבו האזהרה הכי נחוצה, היא לא הופיעה.
    syncAutoRunWarning();
    renderServicesList();
  });

  // עדכון בזמן אמת של שירותים פעילים כשהמשתמש מדליק/מכבה ב-Popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.customToolPrompts) {
      customToolPrompts = changes.customToolPrompts.newValue || {};
    }

    const connectionChanged = CONNECTION_KEYS.some(k => k in changes);

    if (changes.autoExecute) {
      isAutoExecute = !!changes.autoExecute.newValue;
      const autoToggle = document.getElementById('omni-mcp-auto-toggle');
      if (autoToggle) autoToggle.checked = isAutoExecute;
      syncAutoRunWarning(true);
    }

    if (changes.requireActivation) {
      requireActivation = changes.requireActivation.newValue !== false;
    }

    if (changes.autoRunScope) {
      autoRunScope = changes.autoRunScope.newValue === 'all' ? 'all' : 'read';
      syncAutoRunWarning(true);
    }

    if (!changes.activeServices && !connectionChanged) return;

    chrome.storage.sync.get(['activeServices', ...CONNECTION_KEYS], (data) => {
      connectedServices = computeConnectedServices(data);
      activeServices = (data.activeServices || ['fetch', 'windows'])
        .filter(s => connectedServices.includes(s));
      renderServicesList();
    });
  });

  function openPanel() {
    const panel = document.getElementById('omni-mcp-panel');
    if (!panel) return;
    panel.classList.add('open');
    // הרחבת הכפתור לרוחב הפאנל
    const toggleBtn = document.getElementById('omni-mcp-toggle-btn');
    if (toggleBtn) {
      toggleBtn.classList.add('expanded');
    }
    // חישוב כיוון הפתיחה לפי המיקום הנוכחי - הכפתור נשאר במקומו
    const widget = document.getElementById('omni-mcp-floating-widget');
    if (widget && typeof widget._omniUpdateDirection === 'function') {
      widget._omniUpdateDirection();
    }
  }

  function closePanel() {
    const panel = document.getElementById('omni-mcp-panel');
    if (panel) panel.classList.remove('open');
    hideAutoRunPopup();
    // החזרת הכפתור לגודלו המקורי
    const toggleBtn = document.getElementById('omni-mcp-toggle-btn');
    if (toggleBtn) {
      toggleBtn.classList.remove('expanded');
    }
  }

  function setBadgeBusy(busy) {
    const dot = document.getElementById('omni-mcp-status-dot');
    const btn = document.getElementById('omni-mcp-toggle-btn');
    if (dot) dot.classList.toggle('busy', !!busy);
    if (btn) btn.classList.toggle('busy', !!busy);
  }

  let currentLang = (typeof detectSystemLanguage === 'function') ? detectSystemLanguage() : 'he';

  // Load preferred language or detect from system
  if (typeof getActiveLanguage === 'function') {
    getActiveLanguage((lang) => {
      currentLang = lang;
      window.__gemmcp_current_lang = lang;
    });
  }

  
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING_CONTENT_SCRIPT') {
    sendResponse({ pong: true, site: SITE ? SITE.name : 'unknown' });
    return true;
  }

  if (request.type === 'INJECT_PROMPT') {
    const chatEditor = findGeminiInputField();
    if (chatEditor) {
      const target = (chatEditor.tagName && chatEditor.tagName.toLowerCase() === 'rich-textarea')
        ? (chatEditor.querySelector('div[contenteditable="true"]') || chatEditor)
        : chatEditor;
      setComposerText(target, String(request.text || ''));
      target.focus();
      markChatActivated();
      showToast('התוכן הוכנס בהצלחה לשיחה', 'success');
      sendResponse({success: true});
    } else {
      showToast('לא נמצאה תיבת טקסט', 'error');
      sendResponse({success: false});
    }
    return true;
  }

  // טיפול בביצוע שאילתת API שהגיעה מה-Bridge
  if (request.type === 'EXECUTE_AGENT_QUERY') {
    handleAgentQueryExecution(request);
    sendResponse({ received: true });
    return true;
  }
});

  // -------------------------------------------------------------------------
  // 🤖 טיפול בבקשות שאילתה המגיעות מ-OpenAI API Server
  // -------------------------------------------------------------------------
  async function handleAgentQueryExecution(request) {
    const { jobId, prompt, stream } = request;
    markChatActivated();

    // 1. איתור שדה ההזנה
    let chatEditor = findGeminiInputField();
    let retries = 0;
    while (!chatEditor && retries < 75) {
      await new Promise((r) => setTimeout(r, 400));
      chatEditor = findGeminiInputField();
      retries++;
    }

    if (!chatEditor) {
      chrome.runtime.sendMessage({
        action: 'AGENT_QUERY_COMPLETE',
        jobId,
        error: `לא נמצא שדה הקלט של ${SITE.name || 'AI'} בדף. ודא שהשיחה נטענה במלואה.`
      });
      return;
    }

    const target = (chatEditor.tagName && chatEditor.tagName.toLowerCase() === 'rich-textarea')
      ? (chatEditor.querySelector('div[contenteditable="true"]') || chatEditor)
      : chatEditor;

    // 2. שמירת המצב הקודם, הזנת הפרומפט ושליחה
    function getLatestAgentResponseText() {
      // בדיקה לפי הסלקטורים הספציפיים לאתר הנוכחי (Gemini, Claude, ChatGPT)
      if (SITE && SITE.messages) {
        const siteMsgs = Array.from(document.querySelectorAll(SITE.messages));
        if (siteMsgs.length > 0) {
          const last = siteMsgs[siteMsgs.length - 1];
          const textEl = last.querySelector('.model-response-text, .markdown, .response-content, .font-claude-message, p') || last;
          const txt = (textEl.innerText || textEl.textContent || '').trim();
          if (txt) return txt;
        }
      }
      // גיבוי לבוררים כלליים
      const list = Array.from(document.querySelectorAll('model-response, [data-test-id="model-response"], message-content, [data-message-author-role="assistant"], [data-test-render-count]:not(:has([data-testid="user-message"]))'));
      if (list.length > 0) {
        const last = list[list.length - 1];
        const textEl = last.querySelector('.model-response-text, .markdown, .response-content, .font-claude-message') || last;
        const txt = (textEl.innerText || textEl.textContent || '').trim();
        if (txt) return txt;
      }
      const markdowns = Array.from(document.querySelectorAll('.markdown, .model-response-text'));
      if (markdowns.length > 0) {
        const lastMd = markdowns[markdowns.length - 1];
        return (lastMd.innerText || lastMd.textContent || '').trim();
      }
      return '';
    }

    const beforeText = getLatestAgentResponseText();
    setComposerText(target, String(prompt || ''));
    setTimeout(() => {
      if (!clickGeminiSendButton()) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
    }, 250);
    showToast(`מעבד שאילתת API ב-${SITE.name || 'AI'}...`, 'info');
    addLog(`התקבלה שאילתת API חדשה (${jobId}) - נשלחה ל-${SITE.name || 'AI'}`);

    // 3. מעקב אחר התשובה הנבנית
    let lastStreamLength = 0;
    let stableText = '';
    let stableCount = 0;
    const maxPollingAttempts = 1200; // עד ~360 שניות (6 דקות)
    let attempts = 0;

    const pollInterval = setInterval(() => {
      attempts++;
      const currentText = getLatestAgentResponseText();

      // בדיקת כפתור עצירה פעיל
      const isStopBtnVisible = Array.from(document.querySelectorAll('button[aria-label*="Stop" i], button[aria-label*="עצור"], button[aria-label*="הפסק"], .stop-button, mat-icon[data-mat-icon-name="stop"], mat-icon[fonticon="stop"]')).some(isElementVisible);

      // הזרמת delta במידה ומוגדר stream
      if (stream && currentText && currentText !== beforeText && currentText.length > lastStreamLength) {
        const delta = currentText.substring(lastStreamLength);
        lastStreamLength = currentText.length;
        chrome.runtime.sendMessage({
          action: 'AGENT_STREAM_CHUNK',
          jobId,
          chunk: delta
        });
      }

      // בדיקת סיום כאשר המודל סיים לייצר
      if (currentText && currentText !== beforeText && currentText.trim().length > 0) {
        if (currentText === stableText) {
          stableCount++;
          // סיום מוודא כאשר כפתור Stop נעלם או שהטקסט יציב לחלוטין
          if ((!isStopBtnVisible && stableCount >= 2) || stableCount >= 4) {
            clearInterval(pollInterval);
            showToast(`שאילתת API ב-${SITE.name || 'AI'} הושלמה בהצלחה ✅`, 'success');
            addLog(`✅ שאילתת API (${jobId}) הושלמה והוחזרה ללקוח`);
            chrome.runtime.sendMessage({
              action: 'AGENT_QUERY_COMPLETE',
              jobId,
              text: currentText
            });
            return;
          }
        } else {
          stableText = currentText;
          stableCount = 0;
        }
      }

      // פסק זמן במידה והמודל לא הגיב
      if (attempts >= maxPollingAttempts) {
        clearInterval(pollInterval);
        const finalTxt = (getLatestAgentResponseText() !== beforeText) ? getLatestAgentResponseText() : stableText;
        chrome.runtime.sendMessage({
          action: 'AGENT_QUERY_COMPLETE',
          jobId,
          text: finalTxt || '',
          error: finalTxt ? undefined : `פסק זמן בהמתנה לתשובה מ-${SITE.name || 'AI'}.`
        });
      }
    }, 300);
  }

  // שמירה על Service Worker פעיל ובדיקת משימות API ברקע
  setInterval(() => {
    try {
      chrome.runtime.sendMessage({ action: 'TRIGGER_AGENT_POLL' }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }, 2000);

  function createFloatingUI() {
    if (document.getElementById('omni-mcp-floating-widget')) return;

    const isRtl = currentLang === 'he';

    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'omni-mcp-floating-widget';
    widgetContainer.dir = isRtl ? 'rtl' : 'ltr';
    widgetContainer.innerHTML = `
      <div class="omni-mcp-panel" id="omni-mcp-panel" dir="${isRtl ? 'rtl' : 'ltr'}">
        <div class="omni-mcp-header" id="omni-mcp-drag-header" title="${t('widgetDragHeader', currentLang)}">
          <div class="omni-mcp-title">
            <img src="${chrome.runtime.getURL('icons/icon32.png')}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">
            <span>${t('widgetTitle', currentLang)}</span>
          </div>
          <button class="omni-mcp-close-btn" id="omni-mcp-close-panel">✕</button>
        </div>

        <div class="omni-mcp-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <button type="button" class="omni-mcp-btn-rescan-icon" id="omni-mcp-rescan-btn" title="${t('widgetRescanTitle', currentLang)}">
              <svg viewBox="0 0 24 24" style="width:13px;height:13px;" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              <span>${t('widgetRescanBtn', currentLang)}</span>
            </button>
            <button type="button" class="omni-mcp-stop-btn-top" id="omni-mcp-stop-btn" title="${t('widgetStopTitle', currentLang)}">
              <svg class="omni-mcp-stop-icon" id="omni-mcp-stop-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
              <span id="omni-mcp-stop-btn-text">${t('widgetStopBtn', currentLang)}</span>
            </button>
          </div>

          <div style="font-size: 12px; color: #6b7280; font-weight: 700; margin-top: 4px;">מצב הרצה</div>
          <div class="omni-mcp-services-chips" id="omni-mcp-scope-chips">
            <div class="omni-service-chip" data-scope="read">🛡️ <span>בטוח</span></div>
            <div class="omni-service-chip" data-scope="all">⚡ <span>אוטונומי</span></div>
          </div>

          <div id="omni-mcp-paused-banner" class="omni-mcp-paused-banner" style="display:none;">
            <span>⏸️ ${currentLang === 'he' ? 'שליחת וקבלת פקודות מושהית (עצירה פעילה)' : 'Command exchange is paused'}</span>
            <button type="button" id="omni-mcp-resume-banner-btn" style="background:#0284c7; color:#fff; border:none; border-radius:4px; padding:2px 8px; font-size:10px; font-weight:700; cursor:pointer;">${t('widgetResumeBtn', currentLang)}</button>
          </div>

          <button class="omni-mcp-action-btn" id="omni-mcp-inject-prompt-btn">
            <svg class="omni-mcp-action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>
            <span>${t('widgetInjectBtn', currentLang)}</span>
          </button>

          <div style="font-size: 12px; color: #6b7280; font-weight: 700; margin-top: 4px;">${t('widgetActiveServices', currentLang)}</div>
          <div class="omni-mcp-services-chips" id="omni-mcp-services-list">
            <!-- Services injected dynamically -->
          </div>

          <div class="omni-mcp-bridge-card" id="omni-mcp-bridge-status-card" style="display:none;">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
              <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; min-width:0;">
                <span class="omni-bridge-indicator" id="omni-bridge-indicator" style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block; flex-shrink:0;"></span>
                <span style="white-space:nowrap;">${t('widgetWinServerLabel', currentLang)}</span>
                <span id="omni-bridge-status-text" style="font-size:11px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t('widgetWinChecking', currentLang)}</span>
              </div>
              <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                <button type="button" class="omni-mcp-bridge-mini-btn start" id="omni-mcp-start-bridge-btn" title="Start Windows Bridge Server" style="display:none;">
                  ${t('widgetWinStartBtn', currentLang)}
                </button>
                <button type="button" class="omni-mcp-bridge-mini-btn stop" id="omni-mcp-stop-bridge-btn" title="Stop Windows Bridge Server" style="display:none;">
                  ${t('widgetWinStopBtn', currentLang)}
                </button>
              </div>
            </div>
            <div id="omni-bridge-offline-hint" style="display:none; margin-top:6px; font-size:11px; color:#991b1b; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; line-height:1.3;">
              <span>${t('widgetWinOfflineHint', currentLang)}</span>
              <a href="https://nodejs.org/" target="_blank" style="color:#0284c7; font-weight:700; text-decoration:underline;">${t('widgetInstallNodeLink', currentLang)}</a>
            </div>
          </div>

          <div class="omni-mcp-toggle-row">
            <span>${t('widgetAutoRun', currentLang)}</span>
            <input type="checkbox" id="omni-mcp-auto-toggle" ${isAutoExecute ? 'checked' : ''} style="cursor: pointer; transform: scale(1.2);">
          </div>

          <details class="omni-mcp-logs-details" id="omni-mcp-schedule-details">
            <summary class="omni-mcp-logs-summary">
              <span class="omni-mcp-logs-arrow">▾</span>
              <span>תזמון פרומפט</span>
            </summary>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
              <textarea id="omni-mcp-schedule-text" rows="2" placeholder="מה לשלוח לג'מיני"
                style="width:100%; box-sizing:border-box; resize:vertical; font-size:11.5px; padding:7px;
                       border-radius:7px; border:1px solid #d5dbe3; background:#fff; color:#1e293b; font-family:inherit;"></textarea>
                <div style="display:flex; align-items:center; gap:6px;">
                <input id="omni-mcp-schedule-min" type="number" min="1" max="43200" value="30"
                  style="width:70px; font-size:11.5px; padding:5px 7px; border-radius:7px;
                         border:1px solid #d5dbe3; background:#fff; color:#1e293b;">
                <span style="flex:1"></span>
                <button id="omni-mcp-schedule-add" class="omni-mcp-action-btn"
                  style="font-size:11.5px; padding:5px 12px;">תזמן</button>
              </div>
              <div id="omni-mcp-schedule-list" style="display:flex; flex-direction:column; gap:4px;"></div>
            </div>
          </details>


          <div id="omni-mcp-pending-actions"></div>

          <details class="omni-mcp-logs-details" id="omni-mcp-logs-details">
            <summary class="omni-mcp-logs-summary">
              <span class="omni-mcp-logs-arrow">▾</span>
              <span>${t('widgetLogsTitle', currentLang)}</span>
              <span class="omni-mcp-logs-error-badge" id="omni-mcp-logs-error-badge" hidden>0 ${t('widgetErrorsBadge', currentLang)}</span>
              <span style="flex:1"></span>
              <span id="omni-mcp-logs-export" title="ייצוא היומן לקובץ"
                    style="font-size:10.5px; color:#93c5fd; cursor:pointer; user-select:none;">ייצוא</span>
              <span id="omni-mcp-logs-clear" title="ניקוי היומן"
                    style="font-size:10.5px; color:#94a3b8; cursor:pointer; user-select:none; margin-inline-start:8px;">ניקוי</span>
            </summary>
            <div id="omni-mcp-logs" style="display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto; margin-top: 6px;">
              <div class="omni-mcp-log-item">${t('widgetLogsReady', currentLang)}</div>
            </div>
          </details>
        </div>
      </div>

      <button class="omni-mcp-badge-btn" id="omni-mcp-toggle-btn" title="GemMCP">
        <img src="${chrome.runtime.getURL('icons/icon32.png')}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">
        <span>GemMCP</span>
      </button>
    `;

    document.body.appendChild(widgetContainer);

    const toggleBtn = document.getElementById('omni-mcp-toggle-btn');
    const panel = document.getElementById('omni-mcp-panel');
    const closeBtn = document.getElementById('omni-mcp-close-panel');
    const injectBtn = document.getElementById('omni-mcp-inject-prompt-btn');
    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    const dragHeader = document.getElementById('omni-mcp-drag-header');
    logsContainer = document.getElementById('omni-mcp-logs');
    loadActivatedChats();
    watchChatChanges();
    restorePersistedLog();
    wireLogControls();
    wireScheduleControls();
    wireScopeControl();

    renderServicesList();
    initWidgetPosition(widgetContainer, toggleBtn, dragHeader, panel);

    toggleBtn.addEventListener('click', (e) => {
      if (toggleBtn.dataset.justDragged === 'true') {
        toggleBtn.dataset.justDragged = 'false';
        return;
      }
      if (panel.classList.contains('open')) {
        closePanel();
      } else {
        openPanel();
      }
    });

    closeBtn.addEventListener('click', () => closePanel());

    // Close panel when clicking outside the widget
    document.addEventListener('click', (e) => {
      const widget = document.getElementById('omni-mcp-floating-widget');
      if (widget && !widget.contains(e.target) && panel.classList.contains('open')) {
        closePanel();
      }
    });

    const toggleRow = widgetContainer.querySelector('.omni-mcp-toggle-row');
    if (toggleRow) {
      toggleRow.addEventListener('mouseenter', () => {
        isAutoRunHovered = true;
        showAutoRunPopup(toggleRow, 0);
      });
      toggleRow.addEventListener('mouseleave', () => {
        isAutoRunHovered = false;
        if (!autoRunNoticeTimer) hideAutoRunPopup();
      });
    }

    autoToggle.addEventListener('change', (e) => {
      isAutoExecute = e.target.checked;
      chrome.storage.sync.set({ autoExecute: isAutoExecute });
      syncAutoRunWarning(true, autoToggle);
      addLog(`מצב Auto-run: ${isAutoExecute ? 'פעיל' : 'כבוי'}`);
    });

    // כפתור סריקה מחדש וביצוע פקודה אחרונה ידנית
    const rescanBtn = document.getElementById('omni-mcp-rescan-btn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        addLog('🔍 סורק מחדש את הצ\'אט לאיתור פקודת MCP אחרונה...');
        const found = scanForToolCalls(true);
        if (!found) {
          addLog('ℹ️ לא נמצאה פקודת JSON חדשה לביצוע בצ\'אט.');
        }
      });
    }

    // כפתורי הפעלה/כיבוי של שרת Windows Bridge וסטטוס חי
    const startBridgeBtn = document.getElementById('omni-mcp-start-bridge-btn');
    const stopBridgeBtn = document.getElementById('omni-mcp-stop-bridge-btn');
    const bridgeIndicator = document.getElementById('omni-bridge-indicator');
    const bridgeStatusText = document.getElementById('omni-bridge-status-text');
    const bridgeOfflineHint = document.getElementById('omni-bridge-offline-hint');
    const bridgeCard = document.getElementById('omni-mcp-bridge-status-card');

    function updateBridgeCardVisibility() {
      if (!bridgeCard) return;
      const isWindowsActive = activeServices && activeServices.includes('windows');
      bridgeCard.style.display = isWindowsActive ? 'block' : 'none';
    }

    let launchFailedDueToMissingNode = false;
    let isShuttingDown = false;

    async function checkBridgeStatus() {
      updateBridgeCardVisibility();
      if (isShuttingDown) return false;
      if (!bridgeIndicator || !bridgeStatusText) return false;
      if (!activeServices || !activeServices.includes('windows')) return false;
      if (!chrome.runtime || !chrome.runtime.id) return false;

      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'TEST_SERVICE_CONNECTION', service: 'windows' }, (res) => {
          if (isShuttingDown) {
            resolve(false);
            return;
          }
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          if (res && res.success) {
            launchFailedDueToMissingNode = false;
            bridgeIndicator.style.background = '#0284c7'; // כחול חי
            bridgeIndicator.style.boxShadow = '0 0 6px rgba(2, 132, 199, 0.5)';
            bridgeStatusText.textContent = 'פעיל ומחובר';
            bridgeStatusText.style.color = '#0284c7';
            if (startBridgeBtn) startBridgeBtn.style.display = 'none';
            if (stopBridgeBtn) stopBridgeBtn.style.display = 'flex';
            if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'none';
            resolve(true);
          } else {
            bridgeIndicator.style.background = '#94a3b8'; // כחול-אפרפר רגוע/כבוי
            bridgeIndicator.style.boxShadow = 'none';
            if (launchFailedDueToMissingNode) {
              bridgeStatusText.textContent = 'ההפעלה נכשלה';
              if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'block';
            } else {
              bridgeStatusText.textContent = 'כבוי';
              if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'none';
            }
            bridgeStatusText.style.color = '#64748b';
            if (startBridgeBtn) startBridgeBtn.style.display = 'flex';
            if (stopBridgeBtn) stopBridgeBtn.style.display = 'none';
            resolve(false);
          }
        });
      });
    }

    if (startBridgeBtn) {
      let isStarting = false;
      startBridgeBtn.addEventListener('click', () => {
        if (isStarting || isShuttingDown) return;
        isStarting = true;
        launchFailedDueToMissingNode = false;
        if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'none';
        bridgeStatusText.textContent = 'מפעיל... ⏳';
        bridgeStatusText.style.color = '#0284c7';
        triggerBridgeStartupProtocol();
        addLog('⚡ נשלחה פקודת הפעלה לשרת Windows Bridge...');
        
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const ok = await checkBridgeStatus();
          if (ok || attempts >= 8) {
            clearInterval(poll);
            isStarting = false;
            if (ok) {
              launchFailedDueToMissingNode = false;
              if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'none';
              addLog('✅ שרת Windows Bridge פועל ומחובר בהצלחה!');
            } else {
              launchFailedDueToMissingNode = true;
              bridgeStatusText.textContent = 'ההפעלה נכשלה';
              bridgeStatusText.style.color = '#475569';
              if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'block';
              addLog('⚠️ השרת לא הגיב. ייתכן ש-Node.js אינו מותקן במחשב (נא להתקין מ-https://nodejs.org).');
            }
          }
        }, 1000);
      });
    }

    if (stopBridgeBtn) {
      stopBridgeBtn.addEventListener('click', () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        bridgeStatusText.textContent = 'מכבה... ⏳';
        bridgeStatusText.style.color = '#64748b';
        chrome.runtime.sendMessage({ action: 'SHUTDOWN_BRIDGE_SERVER' }, () => {
          isShuttingDown = false;
          bridgeIndicator.style.background = '#94a3b8';
          bridgeIndicator.style.boxShadow = 'none';
          bridgeStatusText.textContent = 'כבוי';
          bridgeStatusText.style.color = '#64748b';
          if (startBridgeBtn) startBridgeBtn.style.display = 'flex';
          if (stopBridgeBtn) stopBridgeBtn.style.display = 'none';
          if (bridgeOfflineHint) bridgeOfflineHint.style.display = 'none';
          addLog('🛑 שרת Windows Bridge כובה.');
        });
      });
    }

    // בדיקת סטטוס ראשונית ומחזורית כל 4 שניות
    checkBridgeStatus();
    setInterval(checkBridgeStatus, 4000);

    // אחרי הפעלה הפאנל נסגר - הוא ייפתח שוב רק לבקשת אישור, לשגיאה, או בלחיצה ידנית
    injectBtn.addEventListener('click', () => {
      injectActiveSystemPrompt();
      closePanel();
    });

    // פתיחת הלוג ידנית מסמנת שהשגיאות נקראו
    const logsDetails = document.getElementById('omni-mcp-logs-details');
    if (logsDetails) {
      logsDetails.addEventListener('toggle', () => {
        if (logsDetails.open) {
          unreadErrors = 0;
          updateErrorBadge();
        }
      });
    }
  }

  function initWidgetPosition(container, toggleBtn, dragHeader, panel) {
    let startX = 0, startY = 0;
    let pressX = 0, pressY = 0;
    let isDragging = false;
    const MARGIN = 10;

    // מיקום הווידג'ט נקבע תמיד לפי הכפתור (הפאנל צף מעליו ולא משנה את גודל המכולה)
    function applyPosition(left, top) {
      const btnRect = toggleBtn.getBoundingClientRect();
      const maxLeft = window.innerWidth - btnRect.width - MARGIN;
      const maxTop = window.innerHeight - btnRect.height - MARGIN;

      const clampedLeft = Math.max(MARGIN, Math.min(left, Math.max(MARGIN, maxLeft)));
      const clampedTop = Math.max(MARGIN, Math.min(top, Math.max(MARGIN, maxTop)));

      container.style.left = clampedLeft + 'px';
      container.style.top = clampedTop + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';

      updatePanelDirection(clampedLeft, clampedTop);
      return { left: clampedLeft, top: clampedTop };
    }

    // בוחר לאיזה כיוון הפאנל ייפתח כך שיישאר בתוך המסך - הכפתור עצמו לא זז
    function updatePanelDirection(left, top) {
      const btnRect = toggleBtn.getBoundingClientRect();
      const panelHeight = panel.offsetHeight || 420;
      const panelWidth = panel.offsetWidth || 360;

      const flipDown = top < panelHeight + MARGIN;
      panel.classList.toggle('flip-down', flipDown);
      panel.classList.toggle('flip-left', left + btnRect.width < panelWidth + MARGIN);

      // הגובה היה calc(100vh - 120px) קבוע, בלי קשר לאיפה הכפתור עומד.
      // כשגוררים את הווידג'ט למעלה הפאנל נפתח כלפי מטה וגולש מתחת לקצה
      // המסך, ואין גלילת עמוד שמגיעה לשם כי הוא absolute בתוך fixed.
      const room = flipDown
        ? window.innerHeight - btnRect.bottom - MARGIN * 2
        : btnRect.top - MARGIN * 2;
      panel.style.maxHeight = Math.max(240, Math.round(room)) + 'px';
    }

    // מאפשר לחשב מחדש את כיוון הפתיחה ברגע שהפאנל נפתח (אז יש לו מידות אמיתיות)
    container._omniUpdateDirection = () => {
      const rect = toggleBtn.getBoundingClientRect();
      updatePanelDirection(rect.left, rect.top);
    };

    // טעינת מיקום שמור (ברירת מחדל: פינה ימנית תחתונה - מוגדרת ב-CSS)
    chrome.storage.local.get(['widgetPos'], (data) => {
      const saved = data && data.widgetPos;
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        applyPosition(saved.left, saved.top);
      } else {
        // ברירת מחדל מה-CSS (bottom/right) - רק מחשבים כיוון פתיחה
        const rect = toggleBtn.getBoundingClientRect();
        updatePanelDirection(rect.left, rect.top);
      }
    });

    // שמירה על הווידג'ט בתוך המסך גם אחרי שינוי גודל חלון
    window.addEventListener('resize', () => {
      const rect = toggleBtn.getBoundingClientRect();
      if (container.style.left) {
        applyPosition(rect.left, rect.top);
      } else {
        updatePanelDirection(rect.left, rect.top);
      }
    });

    [toggleBtn, dragHeader].forEach(handle => {
      handle.style.cursor = 'grab';
      handle.addEventListener('mousedown', dragMouseDown);
    });

    function dragMouseDown(e) {
      if (e.target.id === 'omni-mcp-close-panel' || e.target.closest('#omni-mcp-close-panel')) return;

      isDragging = false;
      const rect = toggleBtn.getBoundingClientRect();
      // ההיסט בין נקודת הלחיצה לפינת הכפתור - שומר על גרירה יציבה בלי "קפיצות"
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      pressX = e.clientX;
      pressY = e.clientY;

      document.addEventListener('mouseup', closeDragElement);
      document.addEventListener('mousemove', elementDrag);
    }

    function elementDrag(e) {
      e.preventDefault();

      if (!isDragging) {
        // מרחק מנקודת הלחיצה המקורית - מבדיל בין קליק לגרירה
        const moveDistance = Math.hypot(e.clientX - pressX, e.clientY - pressY);
        if (moveDistance > 4) {
          isDragging = true;
          toggleBtn.dataset.justDragged = 'true';
          toggleBtn.style.cursor = 'grabbing';
          dragHeader.style.cursor = 'grabbing';
        }
      }

      if (isDragging) {
        applyPosition(e.clientX - startX, e.clientY - startY);
      }
    }

    function closeDragElement() {
      document.removeEventListener('mouseup', closeDragElement);
      document.removeEventListener('mousemove', elementDrag);

      toggleBtn.style.cursor = 'grab';
      dragHeader.style.cursor = 'grab';

      if (isDragging) {
        const rect = toggleBtn.getBoundingClientRect();
        chrome.storage.local.set({
          widgetPos: { left: rect.left, top: rect.top }
        });
        setTimeout(() => {
          toggleBtn.dataset.justDragged = 'false';
        }, 150);
      }
    }
  }

  function renderServicesList() {
    const list = document.getElementById('omni-mcp-services-list');
    if (!list) return;

    list.innerHTML = '';
    const allServices = [
      {
        id: 'supabase',
        name: 'Supabase',
        svg: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;" fill="none"><path d="M21.362 9.354H12V.344a.344.344 0 0 0-.6-.23L.78 12.637a.86.86 0 0 0 .638 1.488h9.362v9.01a.344.344 0 0 0 .6.23l10.62-12.523a.86.86 0 0 0-.638-1.488z" fill="#3ECF8E"/></svg>'
      },
      {
        id: 'notion',
        name: 'Notion',
        svg: '<svg viewBox="0 0 122 122" style="width:14px;height:14px;" fill="none"><path d="M6 12.5 74.5 7.5c8.4-.7 10.6-.2 15.9 3.6l21.9 15.4c3.6 2.6 4.8 3.3 4.8 6.2v83.4c0 5.3-1.9 8.4-8.6 8.9l-79.5 4.8c-5.1.2-7.5-.5-10.2-3.8L4.7 105.9C1.8 102 .6 99.1.6 95.7V21.4C.6 17.1 2.5 13.5 6 12.5Z" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M74.5 7.5 6 12.5C2.5 13.5.6 17.1.6 21.4v74.3c0 3.4 1.2 6.3 4.1 10.2l14.1 18.3c2.7 3.3 5.1 4 10.2 3.8l79.5-4.8c6.7-.5 8.6-3.6 8.6-8.9V32.7c0-2.7-1.1-3.5-4.3-5.8l-.5-.4-21.9-15.4c-5.3-3.8-7.5-4.3-15.9-3.6ZM31 24.4c-6.5.4-8 .5-11.7-2.5L9.9 14.4c-1-1-.5-2.2.9-2.4l65.9-4.8c5.5-.5 8.4 1.4 10.6 3.1l11.4 8.2c.3.2 1.1 1.2.1 1.2l-68 4.1-.2.1ZM23.4 111V39.3c0-3.1 1-4.6 3.9-4.8l78-4.6c2.7-.2 3.9 1.5 3.9 4.6v71.2c0 3.1-.5 5.8-4.8 6l-74.6 4.3c-4.3.2-6.4-1.2-6.4-5Zm73.7-68c.5 2.2 0 4.3-2.2 4.6l-3.6.7v52.8c-3.1 1.7-6 2.7-8.4 2.7-3.9 0-4.8-1.2-7.7-4.8L51.5 61.9v35.9l7.5 1.7s0 4.3-6 4.3l-16.6 1c-.5-1 0-3.4 1.7-3.9l4.3-1.2V50.5l-6-.5c-.5-2.2.7-5.3 4.1-5.5l17.8-1.2 24.5 37.5V47.6l-6.3-.7c-.5-2.7 1.4-4.6 3.9-4.8l17-1Z" fill="#000000"/></svg>'
      },
      {
        id: 'github',
        name: 'GitHub',
        svg: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;" fill="#181717"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>'
      },
      {
        id: 'fetch',
        name: 'Web Fetch',
        svg: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
      },
      {
        id: 'windows',
        name: 'Windows',
        svg: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;" fill="#0078d4"><path d="M2 2h9.2v9.2H2V2zm10.8 0H22v9.2h-9.2V2zM2 12.8h9.2V22H2v-9.2zm10.8 0H22V22h-9.2v-9.2z"/></svg>'
      },
      {
        id: 'custom',
        name: 'Custom MCP',
        svg: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;" fill="none" stroke="#9333ea" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v8H2z"></path></svg>'
      }
    ];

    // מציגים רק שירותים שבאמת מחוברים בהגדרות (Popup)
    const visibleServices = allServices.filter(srv => connectedServices.includes(srv.id));

    if (visibleServices.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:#9ca3af;padding:4px 0;';
      empty.textContent = 'אין שירותים מחוברים. חבר שירות דרך הגדרות GemMCP.';
      list.appendChild(empty);
      return;
    }

    visibleServices.forEach(srv => {
      const active = activeServices.includes(srv.id);
      const chip = document.createElement('div');
      chip.className = `omni-service-chip ${active ? 'active' : ''}`;
      chip.innerHTML = `${srv.svg} <span>${srv.name}</span>`;
      chip.addEventListener('click', () => {
        if (activeServices.includes(srv.id)) {
          activeServices = activeServices.filter(s => s !== srv.id);
        } else {
          activeServices.push(srv.id);
          if (srv.id === 'windows') {
            ensureWindowsBridgeRunning();
          }
        }
        chrome.storage.sync.set({ activeServices });
        renderServicesList();
        if (typeof checkBridgeStatus === 'function') {
          checkBridgeStatus();
        }
        addLog(`שירות עודכן: ${srv.name} (${activeServices.includes(srv.id) ? 'מופעל' : 'מבוטל'})`);
      });
      list.appendChild(chip);
    });
    if (typeof checkBridgeStatus === 'function') {
      checkBridgeStatus();
    }
  }

  // מזהה הודעות כשל כדי לפתוח את הלוג אוטומטית רק כשבאמת יש בעיה
  function isErrorLog(msg) {
    return /שגיאה|נכשל|לרענן|לא נמצא/.test(msg);
  }

  // היומן היה קיים רק בזיכרון של הלשונית. רענון של הדף מחק את כל ההיסטוריה,
  // ולשונית שנייה לא ראתה דבר ממה שקרה בראשונה - כלומר בדיוק כשמשהו השתבש
  // וצריך לברר מה בוצע, המידע כבר לא היה קיים.
  const LOG_STORE_KEY = 'activityLog';
  const LOG_STORE_MAX = 300;

  // שתי כתיבות באותו tick קראו את אותה רשימה ואז שתיהן כתבו, כך שהשנייה
  // דרסה את הראשונה. אומת: מתוך ארבע רשומות רצופות שרדו שתיים בלבד.
  // שרשור ההבטחות הופך כל כתיבה לקריאה-ואז-כתיבה אטומית.
  let logChain = Promise.resolve();

  function persistLog(entry) {
    const run = async () => {
      try {
        const store = await chrome.storage.local.get([LOG_STORE_KEY]);
        const list = Array.isArray(store[LOG_STORE_KEY]) ? store[LOG_STORE_KEY] : [];
        list.push(entry);
        await chrome.storage.local.set({ [LOG_STORE_KEY]: list.slice(-LOG_STORE_MAX) });
      } catch (e) { /* יומן שנכשל לעולם לא יפיל פעולה אמיתית */ }
    };
    logChain = logChain.then(run, run);
    return logChain;
  }

  async function loadPersistedLog() {
    try {
      const store = await chrome.storage.local.get([LOG_STORE_KEY]);
      return Array.isArray(store[LOG_STORE_KEY]) ? store[LOG_STORE_KEY] : [];
    } catch (e) { return []; }
  }

  function addLog(msg, opts) {
    console.log(`%c[GemMCP] ${msg}`, 'color: #10b981; font-weight: bold;');

    const isError = (opts && typeof opts.error === 'boolean') ? opts.error : isErrorLog(msg);
    persistLog({ ts: new Date().toISOString(), msg: String(msg).slice(0, 500), error: isError });
    if (!logsContainer) return;

    const item = document.createElement('div');
    item.className = `omni-mcp-log-item${isError ? ' error' : ''}`;
    const time = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.textContent = `[${time}] ${msg}`;
    logsContainer.prepend(item);

    if (isError) {
      unreadErrors++;
      updateErrorBadge();
      const details = document.getElementById('omni-mcp-logs-details');
      if (details) details.open = true;
      // פותח גם את החלונית עצמה כדי שהשגיאה לא תתפספס כשהיא מכווצת
      openPanel();
      // ...ואז גולל אליה בפועל. בלי זה הפאנל נפתח על תוכן אחר והשגיאה
      // נשארת מתחת לקפל, וזה בדיוק מה שנראה כמו "היומן נבלע בתחתית".
      if (details) {
        try { details.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    }
  }

  // מציג את ההיסטוריה שנשמרה, כדי שרענון דף או מעבר ללשונית אחרת לא ימחקו
  // את מה שקרה עד עכשיו.
  async function restorePersistedLog() {
    const list = await loadPersistedLog();
    if (!logsContainer || !list.length) return;

    // הטעינה אסינכרונית, וייתכן שכבר נרשמו הודעות חיות בזמן שחיכינו. לכן לא
    // מנקים את המיכל אלא רק את שורת הפתיחה, ומוסיפים את ההיסטוריה מתחת -
    // הודעה חדשה נשארת למעלה, בדיוק כמו בזרימה הרגילה.
    const placeholder = logsContainer.firstElementChild;
    if (placeholder && !placeholder.textContent.startsWith('[')) placeholder.remove();

    for (const e of list.slice(-60).reverse()) {
      const item = document.createElement('div');
      item.className = `omni-mcp-log-item${e.error ? ' error' : ''}`;
      let time = '';
      try { time = new Date(e.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (err) {}
      item.textContent = `[${time}] ${e.msg}`;
      logsContainer.appendChild(item);
    }
  }

  let autoRunNoticeTimer = null;
  let isAutoRunHovered = false;

  function getAutoRunMessage(customScope) {
    const scope = customScope || autoRunScope;
    if (!isAutoExecute && scope !== 'all') {
      return {
        icon: 'ℹ️',
        text: 'הרצה אוטומטית כבויה. כל פעולה תדרוש אישור ידני.',
        type: 'off'
      };
    }
    if (scope === 'all') {
      return {
        icon: '⚡',
        text: 'מצב אוטונומי. הכל ירוץ בלי לשאול אותך - כולל הרצת פקודות, מחיקה, כתיבה לקבצים ותוכניות מרובות שלבים.',
        type: 'autonomous'
      };
    }
    return {
      icon: '🛡️',
      text: 'הרצה אוטומטית דלוקה במצב בטוח. רק פעולות קריאה ירוצו בלי לשאול אותך. כל פעולה שמשנה משהו עדיין דורשת אישור.',
      type: 'safe'
    };
  }

  function showAutoRunPopup(targetEl, tempDurationMs = 0, previewScope = null) {
    if (!targetEl) return;
    let popup = document.getElementById('omni-mcp-autorun-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'omni-mcp-autorun-popup';
      popup.className = 'omni-mcp-autorun-popup';
      popup.innerHTML = `
        <span class="omni-popup-icon" style="font-size:14px; margin-inline-end:6px; flex-shrink:0;"></span>
        <span class="omni-popup-text" style="flex:1;"></span>
      `;
      document.body.appendChild(popup);
    }

    const msg = getAutoRunMessage(previewScope);
    const iconSpan = popup.querySelector('.omni-popup-icon');
    const textSpan = popup.querySelector('.omni-popup-text');
    if (iconSpan) iconSpan.textContent = msg.icon;
    if (textSpan) textSpan.textContent = msg.text;

    popup.classList.add('visible');

    const rect = targetEl.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    // Position next to the element (prefer to the left of the element in RTL)
    let left = rect.left - popupRect.width - 12;
    let top = rect.top + (rect.height / 2) - (popupRect.height / 2);

    if (left < 10) {
      if (rect.right + popupRect.width + 12 < window.innerWidth) {
        left = rect.right + 12;
      } else {
        left = Math.max(10, Math.min(window.innerWidth - popupRect.width - 10, rect.left + (rect.width / 2) - (popupRect.width / 2)));
        if (rect.top - popupRect.height - 10 > 10) {
          top = rect.top - popupRect.height - 10;
        } else {
          top = rect.bottom + 10;
        }
      }
    }

    if (top < 10) top = 10;
    if (top + popupRect.height > window.innerHeight - 10) {
      top = window.innerHeight - popupRect.height - 10;
    }

    popup.style.top = `${Math.round(top)}px`;
    popup.style.left = `${Math.round(left)}px`;

    if (autoRunNoticeTimer) {
      clearTimeout(autoRunNoticeTimer);
      autoRunNoticeTimer = null;
    }

    if (tempDurationMs > 0) {
      autoRunNoticeTimer = setTimeout(() => {
        autoRunNoticeTimer = null;
        if (!isAutoRunHovered) {
          hideAutoRunPopup();
        }
      }, tempDurationMs);
    }
  }

  function hideAutoRunPopup() {
    if (autoRunNoticeTimer) {
      clearTimeout(autoRunNoticeTimer);
      autoRunNoticeTimer = null;
    }
    const popup = document.getElementById('omni-mcp-autorun-popup');
    if (popup) {
      popup.classList.remove('visible');
    }
  }

  // הודעת מצב הרצה מוצגת כחלונית צפה ליד הכפתור/הצ'יפ
  function syncAutoRunWarning(flashNotice = false, targetEl = null) {
    if (flashNotice) {
      const toggleRow = document.querySelector('.omni-mcp-toggle-row');
      const autoToggle = document.getElementById('omni-mcp-auto-toggle');
      const el = targetEl || autoToggle || toggleRow;
      if (el) showAutoRunPopup(el, 3500);
    } else if (!isAutoRunHovered && !autoRunNoticeTimer) {
      hideAutoRunPopup();
    }
    syncScopeChips();
  }

  // הצ'יפים משקפים תמיד את ההגדרה השמורה. היא נשמרת ב-chrome.storage.sync,
  // כלומר היא אחת לכל השיחות ולכל הלשוניות, ולא נאפסת בין צ'אטים.
  function syncScopeChips() {
    document.querySelectorAll('#omni-mcp-scope-chips .omni-service-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.scope === autoRunScope);
    });
  }

  // תזמון הזרקת פרומפט. הצד שיוצר את ההתראות היה חסר לגמרי, ולכן המאזין
  // ברקע לא יכול היה לפעול - זה הממשק שמייצר אותן.
  // הבורר נקשר בבניית הפאנל, ולא רק כשלוחצים על המתג: אחרת הוא לא היה מגיב
  // כלל כשההרצה האוטומטית כבר הייתה דלוקה מקודם.
  // כרטיס ביטול להתקנה שרצה. הוא נשאר בפאנל עד שמבטלים או סוגרים אותו,
  // ומופיע מיד אחרי שהמתקין הופעל - שם עוד אפשר לחזור אחורה.
  function showInstallCancelCard(info) {
    const container = document.getElementById('omni-mcp-pending-actions');
    if (!container) return;
    openPanel();

    const card = document.createElement('div');
    card.className = 'omni-mcp-query-card';
    card.style.borderInlineStart = '4px solid #b45309';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:12px; font-weight:700; color:#fcd34d; margin-bottom:4px;';
    title.textContent = '📦 התקנה רצה כעת';
    card.appendChild(title);

    const body = document.createElement('div');
    body.style.cssText = 'font-size:11.5px; color:#cbd5e1; line-height:1.6; margin-bottom:8px; word-break:break-all;';
    body.textContent = `${info.from || ''}${info.bytes ? ` · ${Math.round(info.bytes / 1024)} KB` : ''}`;
    card.appendChild(body);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px; color:#94a3b8; margin-bottom:8px;';
    hint.textContent = 'ביטול יעצור את המתקין וימחק את הקובץ שהורד.';
    card.appendChild(hint);

    const btns = document.createElement('div');
    btns.className = 'omni-mcp-btn-group';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'omni-mcp-action-btn';
    cancelBtn.textContent = 'בטל ומחק את מה שהורד';
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'מבטל...';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'CANCEL_INSTALL', jobId: info.jobId });
        if (res && res.success) {
          const n = (res.data && res.data.removed && res.data.removed.length) || 0;
          addLog(`ההתקנה בוטלה. נמחקו ${n} פריטים שהורדו.`);
          card.remove();
        } else {
          addLog(`הביטול נכשל: ${(res && res.error) || 'לא ידוע'}`, { error: true });
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'נסה לבטל שוב';
        }
      } catch (e) {
        addLog(`הביטול נכשל: ${e.message}`, { error: true });
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'נסה לבטל שוב';
      }
    });

    const dismiss = document.createElement('button');
    dismiss.className = 'omni-mcp-action-btn';
    dismiss.style.opacity = '0.7';
    dismiss.textContent = 'סגור';
    dismiss.addEventListener('click', () => card.remove());

    btns.appendChild(cancelBtn);
    btns.appendChild(dismiss);
    card.appendChild(btns);
    container.appendChild(card);
  }

  // זיהוי סירוב של המודל.
  //
  // Gemini 3.1 Pro מסרב לפרומפט ההפעלה ועונה משהו בסגנון "I cannot adopt this
  // setup". בלי לזהות את זה, המשתמש רואה שכלום לא עובד ומסיק שהכלי שבור -
  // בזמן שכל מה שצריך הוא להחליף דגם. Flash מקבל את הפרומפט.
  // הרשימה הזו הייתה מכוונת לניסוח של Gemini Pro בלבד. כשהתוסף התחיל
  // לפעול גם בקלוד וב-ChatGPT, סירוב שלהם לא זוהה כלל - המשתמש ראה שיחה
  // שלא קורה בה כלום ולא הבין למה. הניסוחים שנוספו כאן נלקחו מסירוב אמיתי
  // שנמדד באתר, לא מניחוש.
  const REFUSAL_MARKERS = [
    'cannot adopt', 'can not adopt', "can't adopt",
    'cannot output json', 'unable to interact with external',
    'i am an ai assistant designed to help with information',
    'לא אוכל לאמץ', 'אינני יכול לבצע פעולות',

    // קלוד, מילה במילה: "I don't actually have a tool integration like this"
    'tool integration like this',
    "don't have a tool integration", 'do not have a tool integration',

    // ניסוחים נפוצים נוספים. מכוונים מספיק כדי לא לתפוס שיחה רגילה על קבצים.
    "can't run commands on your", 'cannot run commands on your',
    "don't have access to your file system", 'no access to your file system',
    "i'm not able to execute", 'i am not able to execute'
  ];

  function watchForModelRefusal() {
    let checks = 0;
    const timer = setInterval(() => {
      if (++checks > 20) { clearInterval(timer); return; }
      const main = document.querySelector('main') || document.body;
      const tail = (main.innerText || '').slice(-1500).toLowerCase();
      // אישור המוכנות מגיע בעברית מג'מיני ובאנגלית מהאחרים.
      if (tail.includes('מוכן') || tail.includes('ready')) { clearInterval(timer); return; }
      if (REFUSAL_MARKERS.some((m) => tail.includes(m))) {
        clearInterval(timer);
        const model = readSelectedModel();
        // העצה 'עבור ל-Flash' נכונה רק בג'מיני. על מסך של קלוד היא מבלבלת.
        const advice = SITE.name === 'Gemini'
          ? 'עבור ל-Flash בבורר הדגמים והפעל שוב.'
          : 'נסה דגם אחר, או בקש מהדגם במפורש להחזיר את בלוק ה-JSON.';
        addLog(
          'הדגם' + (model ? ' (' + model + ')' : '') + ' סירב להפעלה. זו מגבלה של הדגם ולא תקלה בתוסף - ' + advice,
          { error: true }
        );
      }
    }, 1500);
  }

  // שם הדגם כפי שג'מיני מציג אותו ליד תיבת ההודעה.
  function readSelectedModel() {
    const el = [...document.querySelectorAll('button, [role="button"]')]
      .find((b) => /^(pro|flash|flash-lite|extended thinking)\b/i.test((b.innerText || '').trim()));
    return el ? el.innerText.trim().split(String.fromCharCode(10))[0] : '';
  }

  function wireScopeControl() {
    const chips = document.querySelectorAll('#omni-mcp-scope-chips .omni-service-chip');
    if (!chips.length) return;
    syncScopeChips();

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        autoRunScope = chip.dataset.scope === 'all' ? 'all' : 'read';
        chrome.storage.sync.set({ autoRunScope });
        syncScopeChips();
        syncAutoRunWarning(true, chip);
        addLog(`מצב הרצה: ${autoRunScope === 'all' ? 'אוטונומי' : 'בטוח'}`);
      });
      chip.addEventListener('mouseenter', () => {
        isAutoRunHovered = true;
        showAutoRunPopup(chip, 0, chip.dataset.scope);
      });
      chip.addEventListener('mouseleave', () => {
        isAutoRunHovered = false;
        if (!autoRunNoticeTimer) hideAutoRunPopup();
      });
    });
  }

  // ---------------------------------------------------------------------------
  function wireScheduleControls() {
    const addBtn = document.getElementById('omni-mcp-schedule-add');
    const details = document.getElementById('omni-mcp-schedule-details');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
      const textEl = document.getElementById('omni-mcp-schedule-text');
      const minEl = document.getElementById('omni-mcp-schedule-min');
      const text = (textEl && textEl.value || '').trim();
      if (!text) { addLog('לא הוזן טקסט לתזמון.', { error: true }); return; }
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'SCHEDULE_INJECTION', text, minutes: Number(minEl && minEl.value)
        });
        if (!res || !res.success) throw new Error(res && res.error || 'התזמון נכשל.');
        textEl.value = '';
        addLog(`תוזמן לשליחה בעוד ${minEl.value} דקות.`);
        renderScheduleList();
      } catch (e) {
        addLog(`תזמון נכשל: ${e.message}`, { error: true });
      }
    });

    if (details) details.addEventListener('toggle', () => { if (details.open) renderScheduleList(); });
  }

  async function renderScheduleList() {
    const list = document.getElementById('omni-mcp-schedule-list');
    if (!list) return;
    let items = [];
    try {
      const res = await chrome.runtime.sendMessage({ action: 'LIST_INJECTIONS' });
      items = (res && res.success && res.data) || [];
    } catch (e) { /* ה-worker לא זמין */ }

    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px; color:#6b7280;';
      empty.textContent = 'אין תזמונים ממתינים.';
      list.appendChild(empty);
      return;
    }

    for (const it of items) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:6px; align-items:center; font-size:11px; color:#334155;';
      let when = '';
      try { when = new Date(it.runAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
      const label = document.createElement('span');
      label.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      label.textContent = `${when} · ${it.text}`;
      label.title = it.text;
      const del = document.createElement('span');
      del.textContent = '✕';
      del.style.cssText = 'cursor:pointer; color:#94a3b8; font-weight:700;';
      del.title = 'ביטול';
      del.addEventListener('click', async () => {
        try {
          await chrome.runtime.sendMessage({ action: 'CANCEL_INJECTION', name: it.name });
          addLog('התזמון בוטל.');
          renderScheduleList();
        } catch (e) { addLog(`ביטול נכשל: ${e.message}`, { error: true }); }
      });
      row.appendChild(label);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  function wireLogControls() {
    const exportEl = document.getElementById('omni-mcp-logs-export');
    const clearEl = document.getElementById('omni-mcp-logs-clear');

    if (exportEl) {
      exportEl.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();                       // אחרת ה-<summary> מתקפל
        const list = await loadPersistedLog();
        const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
        const body = list
          .map((e) => [e.ts, e.error ? 'ERROR' : 'ok', e.msg].join(TAB))
          .join(NL);
        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemmcp-log-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    }

    if (clearEl) {
      clearEl.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try { await chrome.storage.local.remove([LOG_STORE_KEY]); } catch (e) {}
        if (logsContainer) logsContainer.innerHTML = '';
        unreadErrors = 0;
        updateErrorBadge();
        addLog('היומן נוקה.');
      });
    }
  }

  function updateErrorBadge() {
    const badge = document.getElementById('omni-mcp-logs-error-badge');
    if (!badge) return;
    if (unreadErrors > 0) {
      badge.textContent = unreadErrors === 1 ? 'שגיאה 1' : `${unreadErrors} שגיאות`;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  async function ensureWindowsBridgeRunning() {
    if (!activeServices.includes('windows')) return;

    // מתג ההשהיה מבטיח שהגשר "לא יעלה מעצמו". הפונקציה הזו נקראת מלחיצה
    // על הפעלה או על הצ'יפ של Windows - לחיצות מפורשות, אבל לא בקשה
    // להעיר את הגשר. בלי הבדיקה, המתג היה נכבה בפועל ברגע שמפעילים שיחה.
    try {
      const nap = await chrome.storage.sync.get(['bridgeAsleep']);
      if (nap && nap.bridgeAsleep) {
        addLog('התוסף מושהה - הגשר לא הופעל. כבה את מתג ההשהיה בפופאפ.');
        return;
      }
    } catch (e) { /* כשל אחסון אינו סיבה לחסום */ }

    try {
      // דרך ה-service worker ולא fetch מהדף: מדיניות Local Network Access
      // חוסמת גישה מהקשר הדף ל-localhost, ולכן הבדיקה כאן נכשלה תמיד והפעילה
      // את מפעיל הפרוטוקול בכל הפעלה - גם כשהשרת כבר רץ.
      const state = await chrome.runtime.sendMessage({ action: 'GET_BRIDGE_AUTH_STATE' });
      if (state && state.reachable) return;
      triggerBridgeStartupProtocol();
    } catch (e) {
      triggerBridgeStartupProtocol();
    }
  }

  function triggerBridgeStartupProtocol() {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'gemmcp://start';
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 2000);
      addLog('⚡ שרת Windows Bridge מופעל כעת ברקע...');
    } catch (err) {
      console.warn('[GemMCP] Error launching bridge protocol:', err);
    }
  }

  function injectActiveSystemPrompt() {
    // עקבה בכניסה. בלעדיה, יציאה מוקדמת דרך alert לא הותירה שום סימן - לא
    // שורת יומן ולא שגיאה - וההתנהגות נראתה כאילו הכפתור עצמו מת.
    addLog('מפעיל את GemMCP בשיחה הזו...');
    markChatActivated();

    const inputField = findGeminiInputField();
    if (!inputField) {
      addLog('ההפעלה נעצרה: לא נמצאה תיבת הקלט של ג׳מיני בדף.', { error: true });
      return;
    }

    // הפעלה דורסת את תיבת הקלט. אם המשתמש כבר הקליד משהו, הטקסט שלו נשזר
    // לתוך הפרומפט ונשלח יחד איתו - ראיתי את זה קורה. שואלים לפני שדורסים.
    const existing = (inputField.innerText || inputField.textContent || '').trim();
    const alreadyActivated = existing.includes('CRITICAL INSTRUCTIONS');
    if (existing && !alreadyActivated) {
      const NL = String.fromCharCode(10);
      const preview = existing.slice(0, 120) + (existing.length > 120 ? '…' : '');
      const ok = confirm([
        'בתיבת ההודעה כבר יש טקסט, וההפעלה תדרוס אותו:',
        '',
        '"' + preview + '"',
        '',
        'להמשיך?'
      ].join(NL));
      if (!ok) {
        addLog('ההפעלה בוטלה - יש טקסט בתיבת ההודעה.');
        return;
      }
    }

    if (activeServices.includes('windows')) {
      ensureWindowsBridgeRunning();
    }

    chrome.storage.sync.get(['customServers', 'customToolPrompts'], (stored) => {
      // שגיאה כאן יושבת בתוך callback, ולכן היא לא עוצרת כלום ולא מגיעה לשום
      // מקום שרואים. כך בדיוק נעלמה ההפעלה: ReferenceError נזרק בשקט מוחלט,
      // בלי שורת יומן ובלי שגיאה בקונסולה, וההתנהגות נראתה כמו "הכפתור מת".
      try {
        const toolPrompts = stored.customToolPrompts || customToolPrompts || {};
        const promptText = generateOmniSystemPrompt(activeServices, stored.customServers || [], toolPrompts);
        setInputValueAndSend(inputField, promptText);
        addLog(`הוזרקו הנחיות עבור: ${activeServices.join(', ')}`);
        watchForModelRefusal();
      } catch (err) {
        console.error('[GemMCP] ההפעלה נכשלה:', err);
        addLog(`ההפעלה נכשלה: ${err && err.message}`, { error: true });
      }
    });
  }

  function findGeminiInputField() {
    return (
      document.querySelector('rich-textarea div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('.ql-editor') ||
      document.querySelector('rich-textarea') ||
      document.querySelector('textarea')
    );
  }

  let activeSendInterval = null;

  // כתיבת טקסט לתיבת הקלט של ג'מיני. חייבת לעבור דרך execCommand: התיבה היא
  // רכיב Angular, וכתיבה ישירה ל-innerHTML מעדכנת רק את ה-DOM הגלוי בעוד המודל
  // הפנימי - זה שנשלח בפועל - נשאר לא מסונכרן. אז השליחה נכשלת או "נבלעת".
  // execCommand מייצר רצף beforeinput/input תקני ש-Angular מאזין לו ומסנכרן ממנו.
  function setComposerText(target, text) {
    if (!target) return false;

    target.focus();

    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (e) {
      inserted = false;
    }

    // גיבוי לשיטה הישנה אם execCommand אינו זמין או לא הותיר טקסט
    if (!inserted || !(target.innerText || target.textContent || '').trim()) {
      const lines = text.split('\n');
      target.innerHTML = lines.map(line => `<p>${line.trim() === '' ? '<br>' : escapeHtml(line)}</p>`).join('');
    }

    target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // איתור ולחיצה על כפתור השליחה האמיתי של ג'מיני (לא כפתור העצירה)
  function clickGeminiSendButton() {
    const candidates = Array.from(document.querySelectorAll('button')).filter((btn) => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const cls = (btn.className || '').toLowerCase();
      if (label.includes('stop') || label.includes('עצור') || label.includes('הפסק') || cls.includes('stop')) return false;
      return label.includes('send') || label.includes('שלח') || label.includes('submit') ||
             cls.includes('send-button') || !!btn.closest('.send-button-container');
    });
    for (const btn of candidates) {
      if (btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function setInputValueAndSend(element, text) {
    if (!element) return;
    let target = element;
    if (element.tagName && element.tagName.toLowerCase() === 'rich-textarea') {
      target = element.querySelector('div[contenteditable="true"]') || element;
    }

    // ניקוי מנגנון שליחה קודם אם היה פעיל
    if (activeSendInterval) {
      clearInterval(activeSendInterval);
      activeSendInterval = null;
    }

    // הצ'אט שבו הלולאה נפתחה. ג'מיני הוא אפליקציית עמוד יחיד, ולכן מעבר לשיחה
    // אחרת לא טוען מחדש את הסקריפט והאינטרוול שורד. בלי העוגן הזה, לולאה
    // שנמשכת עד 90 שניות המשיכה להזריק לתוך הקומפוזר של השיחה החדשה - כלומר
    // הפרומפט הופיע בצ'אט שבו המשתמש כלל לא הפעיל אותו.
    //
    // ההצהרה חייבת להיות כאן, לפני injectText: היא const, ו-injectText נקראת
    // מיד אחרי ההגדרה שלה. כשהיא ישבה למטה, הקריאה הראשונה נפלה על
    // ReferenceError בתוך callback - כלומר בשקט מוחלט, וההפעלה פשוט לא עשתה
    // כלום. בלי שגיאה בקונסולה ובלי שום סימן.
    const startedInChat = location.pathname;

    function injectText() {
      if (!target || !document.body.contains(target)) {
        const newTarget = findGeminiInputField();
        if (newTarget) {
          target = (newTarget.tagName && newTarget.tagName.toLowerCase() === 'rich-textarea')
            ? (newTarget.querySelector('div[contenteditable="true"]') || newTarget)
            : newTarget;
        }
      }
      if (!target) return;
      if (location.pathname !== startedInChat) return;

      setComposerText(target, text);
    }

    // הזרקה ראשונית של התשובה לתיבת הטקסט
    injectText();

    let attempts = 0;
    // האם כבר ניסינו לשלוח. בלי זה, פעימה שרואה תיבה ריקה אחרי שליחה מוצלחת
    // מפרשת את ההצלחה ככישלון ומזריקה את כל הפרומפט מחדש.
    let sendAttempted = false;
    const maxAttempts = 90; // נבדוק עד כדקה וחצי (90 שניות)
    let hasLoggedWaiting = false;
    let generatingWaits = 0;
    const maxGeneratingWaits = 15; // עד 15 שניות המתנה לסיום יצירה, ואז שולחים בכל זאת
    let hasLoggedGiveUp = false;

    function attemptSend() {
      attempts++;

      // עברו שיחה - הלולאה הזו כבר לא שייכת למסך שהמשתמש רואה.
      if (location.pathname !== startedInChat) {
        if (activeSendInterval) {
          clearInterval(activeSendInterval);
          activeSendInterval = null;
        }
        addLog('השיחה הוחלפה - השליחה הממתינה בוטלה.');
        return;
      }

      // 1. בדיקה אם ג'מיני עדיין מייצר/מזרים את התשובה הנוכחית.
      //    ההמתנה חסומה בזמן: ה-return כאן קודם לבדיקת maxAttempts שבהמשך, ולכן
      //    בלי תקרה נפרדת לולאה זו נמשכת לנצח כשג'מיני נתקע במצב "מייצר".
      if (isGeminiGenerating()) {
        if (!hasLoggedWaiting) {
          addLog(`ממתין לסיום התשובה של ${SITE.name} כדי לשלוח תוצאה...`);
          hasLoggedWaiting = true;
        }
        generatingWaits++;
        if (generatingWaits < maxGeneratingWaits) {
          return; // ממשיכים להמתין לפעימה הבאה
        }
        // חלף זמן ההמתנה - כנראה אינדיקטור תקוע ולא יצירה אמיתית. שולחים בכל זאת.
        if (!hasLoggedGiveUp) {
          addLog(`ג'מיני עדיין מסומן כמייצר לאחר ${maxGeneratingWaits} שניות – שולח בכל זאת`);
          hasLoggedGiveUp = true;
        }
      }

      // 2. ג'מיני סיים לייצר - מוודאים שהטקסט עדיין נמצא בתיבת הקלט
      const currentTarget = (target && document.body.contains(target)) ? target : findGeminiInputField();
      const actualTarget = (currentTarget && currentTarget.tagName && currentTarget.tagName.toLowerCase() === 'rich-textarea')
        ? (currentTarget.querySelector('div[contenteditable="true"]') || currentTarget)
        : currentTarget;

      if (actualTarget) {
        target = actualTarget;
        const currentText = target.innerText || target.textContent || '';
        const looksEmpty = !currentText.trim() || currentText.trim().length < 5;

        // תיבה ריקה אחרי שכבר שלחנו פירושה שהשליחה הצליחה, לא שהטקסט אבד.
        // קודם הפעימה הבאה הזריקה כאן את הפרומפט מחדש, ואז שלחה אותו שוב -
        // כך שההפעלה נכנסה פעמיים, וטקסט שהמשתמש הספיק להקליד נשזר לתוכה.
        if (looksEmpty && sendAttempted) {
          if (activeSendInterval) {
            clearInterval(activeSendInterval);
            activeSendInterval = null;
          }
          return;
        }

        if (looksEmpty) {
          injectText();
        } else {
          target.focus();
          target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // 3. חיפוש כפתור שליחה פעיל
      const allButtons = Array.from(document.querySelectorAll('button'));
      const sendButtons = allButtons.filter((btn) => {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (btn.getAttribute('mattooltip') || '').toLowerCase();
        const cls = (btn.className || '').toLowerCase();
        const testId = (btn.getAttribute('data-test-id') || '').toLowerCase();

        // חסימה מפורשת של כפתורי עצירה
        if (label.includes('stop') || label.includes('עצור') || label.includes('הפסק') || label.includes('עצירת') ||
            tooltip.includes('stop') || tooltip.includes('עצור') || cls.includes('stop')) {
          return false;
        }

        // זיהוי כפתור שליחה בלבד
        return (
          label.includes('send') || label.includes('שלח') || label.includes('שליח') || label.includes('submit') ||
          tooltip.includes('send') || tooltip.includes('שלח') ||
          cls.includes('send-button') ||
          testId.includes('send-button') ||
          (btn.closest('.send-button-container') && !label.includes('stop') && !label.includes('עצור'))
        );
      });

      let clicked = false;
      for (const btn of sendButtons) {
        btn.click();
        clicked = true;
        sendAttempted = true;
        break;
      }

      // 4. אם לא נמצא כפתור או לחיצה ישירה, נבצע סימולציית Enter
      if (!clicked && target) {
        sendAttempted = true;
        target.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
        target.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }

      // 5. אימות לאחר 400ms אם הטקסט נשלח בהצלחה
      setTimeout(() => {
        const remainingText = (target && document.body.contains(target)) ? (target.innerText || target.textContent || '').trim() : '';
        if (!remainingText || remainingText === '' || isGeminiGenerating()) {
          if (activeSendInterval) {
            clearInterval(activeSendInterval);
            activeSendInterval = null;
          }
          console.log(`%c[GemMCP] התשובה נשלחה בהצלחה ל-${SITE.name}!`, 'color: #10b981; font-weight: bold;');
        } else if (attempts >= maxAttempts) {
          if (activeSendInterval) {
            clearInterval(activeSendInterval);
            activeSendInterval = null;
          }
          console.warn('[GemMCP] הגיע למספר ניסיונות מקסימלי לשליחה');
        }
      }, 400);
    }

    // ניסיון שליחה ראשון תוך 300ms, ולאחר מכן בדיקה חוזרת כל 1000ms עד לסיום התשובה ושליחה מוצלחת
    setTimeout(attemptSend, 300);
    activeSendInterval = setInterval(attemptSend, 1000);
  }

  let scanDebounceTimer = null;

  let isObserving = false;
  function observeGeminiResponses() {
    if (isObserving) return;
    isObserving = true;
    const observer = new MutationObserver(() => {
      // הסתרת הודעות MCP_RESPONSE באופן שוטף
      scanAndCollapseUserResponses();

      clearTimeout(scanDebounceTimer);
      // ממתינים חצי שנייה של שקט (Debounce) כדי שג'מיני יסיים להזרים את הטקסט/JSON
      scanDebounceTimer = setTimeout(() => {
        scanForToolCalls();
      }, 600);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // אלמנט נחשב לעדות ליצירה רק אם הוא באמת נראה על המסך. בדף של ג'מיני יש
  // mat-progress-bar ו-mat-spinner מוסתרים שקיימים תמיד, וללא הבדיקה הזו
  // isGeminiGenerating מחזירה true לנצח והסריקה נחסמת לחלוטין.
  function isElementVisible(el) {
    if (!el) return false;
    // getClientRects הוא חישוב layout אחד שכבר מכסה display:none, ניתוק מה-DOM
    // ואלמנט בגודל אפס. רק אם הוא עבר שווה לשלם על getComputedStyle, שהוא
    // הקריאה היקרה, כדי לתפוס visibility ו-opacity.
    if (el.getClientRects().length === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // isGeminiGenerating נקראת בתדירות גבוהה: מכל מחזור של attemptSend (כל שנייה),
  // ומכל סריקה שה-MutationObserver מפעיל. כל בדיקת נראות כופה חישוב layout מחדש,
  // ובדף כבד כמו ג'מיני קריאה חוזרת כזו הופכת ל-layout thrashing שמקפיא את הטאב.
  // לכן התוצאה נשמרת לחלון קצר - קצר מספיק כדי להישאר מדויק, ארוך מספיק כדי
  // שהחישוב לא יקרה עשרות פעמים בשנייה.
  let generatingCache = { value: false, at: 0 };
  const GENERATING_CACHE_MS = 250;

  function isGeminiGenerating() {
    const now = Date.now();
    if (now - generatingCache.at < GENERATING_CACHE_MS) return generatingCache.value;
    const value = computeGeminiGenerating();
    generatingCache = { value, at: now };
    return value;
  }

  function computeGeminiGenerating() {
    // בודק אם יש כפתור Stop פעיל או אינדיקטור טעינה המעיד על כך שג'מיני עדיין מייצר תגובה
    const stopSelectors = [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="עצור"]',
      'button[aria-label*="הפסק"]',
      'button[aria-label*="עצירת"]',
      'button[data-test-id*="stop"]',
      '.stop-button',
      '.stop-btn',
      'mat-icon[data-mat-icon-name="stop"]',
      'mat-icon[fonticon="stop"]',
      // תוספת של האתר הנוכחי. הבוררים הכלליים שמעל תופסים כבר את רוב
      // המקרים, כי כפתור עצירה נושא aria-label עם המילה stop כמעט תמיד.
      ...(SITE.stop || [])
    ];
    
    for (const sel of stopSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!el.disabled && el.getAttribute('aria-disabled') !== 'true' && isElementVisible(el)) {
          return true;
        }
      }
    }

    // בדיקת אינדיקטורי טעינה ואנימציית יצירת תשובה
    const loadingSelectors = [
      'mat-spinner',
      'mat-progress-bar',
      '.sparkle-animation',
      '.response-loading',
      '[data-test-id="sparkle-icon"].animating',
      '.generating',
      '.streaming'
    ];
    
    for (const sel of loadingSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (isElementVisible(el)) return true;
      }
    }

    return false;
  }

  let pageLoadedTimestamp = Date.now();
  let isInitialGracePeriod = true;

  // Grace period של 2 שניות לאחר טעינת הדף - כל אלמנט שקיים מסומן כמטופל כדי למנוע הרצה של היסטוריה ישנה
  setTimeout(() => {
    isInitialGracePeriod = false;
  }, 2500);

  function isElementAlreadyAnswered(el) {
    // בדיקה מדויקת לתור השיחה הגבוה ביותר
    const turnSelector = '[data-test-id="conversation-turn"], [data-test-render-count], [data-testid^="conversation-turn"], model-response';
    const currentTurn = el.closest(turnSelector);
    if (!currentTurn) return false;

    // 1. בדיקת אחים עוקבים ב-DOM
    let nextNode = currentTurn.nextElementSibling;
    while (nextNode) {
      if (nextNode.dataset && nextNode.dataset.omniResponseHidden === 'true') {
        return true;
      }
      const text = nextNode.textContent || '';
      const answered = text.includes('[MCP_RESPONSE:') || text.includes('[MCP Result]');
      if (answered) return true;

      if (SITE.userTurns && (nextNode.matches(SITE.userTurns) || nextNode.querySelector(SITE.userTurns))) {
        return true;
      }
      nextNode = nextNode.nextElementSibling;
    }

    // 2. בדיקה האם יש תור תשובה נוסף של המודל אחרי הפקודה
    const allTurns = Array.from(document.querySelectorAll(turnSelector));
    const currIndex = allTurns.indexOf(currentTurn);
    if (currIndex !== -1 && currIndex < allTurns.length - 1) {
      return true;
    }

    return false;
  }

  // כמה זמן בלוק JSON צריך להישאר ללא שינוי לפני שמותר לפעול עליו בזמן יצירה
  const JSON_STABLE_MS = 700;
  const blockStability = new WeakMap();

  // בלוק נחשב יציב אם הטקסט שלו זהה למה שנראה בפעם הקודמת, במשך JSON_STABLE_MS.
  // JSON שעדיין מוזרם משתנה בכל בדיקה ולכן לא יגיע ליציבות, גם אם במקרה הוא
  // מנתח בהצלחה באמצע הדרך.
  function isBlockStable(el, text) {
    const prev = blockStability.get(el);
    const now = Date.now();
    if (!prev || prev.text !== text) {
      blockStability.set(el, { text, since: now });
      return false;
    }
    return (now - prev.since) >= JSON_STABLE_MS;
  }

  function scanForToolCalls(forceRescan = false) {
    // אותו עיקרון כמו בהעשרה: בשיחה שלא הופעלה, התוסף לא פועל על JSON
    // שג'מיני הפיק. הוא עשוי להפיק JSON מסיבות שאין להן קשר לכלי הזה.
    // סריקה ידנית מהפאנל היא בקשה מפורשת, ולכן היא מפעילה את השיחה.
    if (requireActivation && !isChatActivated()) {
      if (forceRescan) {
        markChatActivated();
        addLog('הופעל בשיחה הזו לפי בקשת סריקה ידנית.');
      } else {
        return false;
      }
    }
    if (isExecuting) return false;

    // בעבר הסריקה נדחתה כאן כל עוד isGeminiGenerating() החזירה true - המתנה
    // ללא גבול. כשג'מיני נתקע במצב "מייצר" אף פקודה לא זוהתה לעולם. כעת סורקים
    // גם בזמן יצירה, וההגנה מפני JSON חלקי היא בדיקת היציבות שבתוך הלופ.
    const generating = !forceRescan && isGeminiGenerating();

    if (forceRescan) {
      isInitialGracePeriod = false;
    }

    const GENERIC_BLOCKS = 'pre, code, .code-block, code-block, .formatted-code, .code-container, div.markdown';
    // מיכלי ההודעות של האתר נוספים לגנריים ולא מחליפים אותם: בג'מיני הטקסט
    // לפעמים יושב ב-message-content בלי pre עוטף, ובאתרים האחרים המצב מקביל.
    const blockSelector = SITE.messages ? GENERIC_BLOCKS + ', ' + SITE.messages : GENERIC_BLOCKS;
    const codeBlocks = Array.from(document.querySelectorAll(blockSelector));
    // בסריקה ידנית נבדוק מהסוף להתחלה כדי למצוא את הפקודה האחרונה ביותר
    const elements = forceRescan ? codeBlocks.reverse() : codeBlocks;
    let foundAndTriggered = false;

    for (const el of elements) {
      // דילוג על אלמנטים שנמצאים בתוך ווידג'טים של התוסף עצמו למניעת לולאות והטמעה כפולה!
      if (el.closest('.gemmcp-tool-pill-container, .omni-mcp-panel, #omni-mcp-floating-badge')) {
        continue;
      }

      if (!forceRescan && (el.dataset.omniProcessed === 'true' || el.closest('[data-omni-processed="true"]'))) {
        continue;
      }

      // innerText כופה חישוב layout, וכאן זה קורה לכל אלמנט מועמד בכל סריקה.
      // textContent לא כופה layout, ולכן משמש כמסנן מקדים זול: רק אלמנט שנראה
      // כמו מועמד אמיתי משלם על innerText.
      const cheap = el.textContent || '';
      if (!cheap.includes('{')) continue;

      const text = el.innerText || cheap;

      if (text.includes('{') && (text.includes('"action"') || text.includes('"service"') || text.includes('"app_name"') || text.includes('"command"') || text.includes('"path"') || text.includes('execute_sql') || text.includes('"query"') || text.includes('"plan"'))) {
        const toolCall = parseToolCall(text);
        if (toolCall) {
          // בזמן יצירה פועלים רק אחרי שהבלוק הפסיק להשתנות. לא מסמנים כמטופל,
          // אחרת הבלוק ייפסל לתמיד ולא ייבדק שוב כשיתייצב.
          if (generating && !isBlockStable(el, text)) {
            clearTimeout(scanDebounceTimer);
            scanDebounceTimer = setTimeout(() => scanForToolCalls(), 300);
            continue;
          }

          el.dataset.omniProcessed = 'true';
          const parentTurn = SITE.turns ? el.closest(SITE.turns) : null;
          if (parentTurn) {
            parentTurn.dataset.omniProcessed = 'true';
            // אם כבר קיים ווידג'ט בתוך התור הזה - לא מייצרים שוב
            if (parentTurn.querySelector('.gemmcp-tool-pill-container')) {
              continue;
            }
          }

          // הסבה / מיזוג מיידי לווידג'ט מקופל אלגנטי (Collapsible Tool Pill)
          const srv = normalizeServiceName(toolCall.service || 'supabase');
          renderCollapsibleToolCard(el, toolCall, srv);

          // אם מדובר בטעינה ראשונית של הדף או שההודעה הזו כבר נענתה בהיסטוריית הצ'אט (ולא נלחץ ריענון ידני)
          if (!forceRescan && (isInitialGracePeriod || isElementAlreadyAnswered(el))) {
            processedHashes.add(buildCallKey(toolCall));
            updateToolCardStatus(srv, toolCall, true);
            continue;
          }

          const callKey = buildCallKey(toolCall);
          if (!forceRescan && processedHashes.has(callKey)) {
            // דילוג שקט כאן הוא בדיוק מה שנראה כמו "הוא לא זיהה את הפקודה".
            console.log('[GemMCP] פקודה זהה שכבר בביצוע - מדלגים', callKey);
            continue;
          }
          processedHashes.add(callKey);

          console.log('%c[GemMCP] 🎯 זוהתה פקודת MCP שלמה ותקינה:', 'color: #f59e0b; font-weight: bold;', toolCall);
          claimThenHandle(callKey, toolCall, forceRescan);
          foundAndTriggered = true;
          if (forceRescan) break; // בלחיצה ידנית מבצעים רק את הפקודה האחרונה שנמצאה
        }
      }
    }
    return foundAndTriggered;
  }

  // ---------------------------------------------------------------------
  // הפעלה לפי שיחה.
  //
  // "הפעלתי בשיחה הזו" הוא מצב של שיחה מסוימת, לא של התוסף כולו. בלי זה
  // התוסף התערב בכל שיחה - הוסיף סכימות להודעות ופעל על JSON שג'מיני
  // הפיק מסיבות אחרות - גם כשלא ביקשת ממנו כלום שם.
  //
  // המצב נשמר לפי מזהה השיחה, כך שהוא שורד רענון ומעבר בין שיחות.
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // מתאם אתר.
  //
  // רוב הקוד כאן אינו תלוי באתר, וזה לא במקרה: איתור תיבת הכתיבה נופל בסוף
  // על contenteditable כללי, ההזרקה עוברת דרך execCommand - שהוא בדיוק מה
  // ש-Angular של ג'מיני ו-ProseMirror של קלוד ו-ChatGPT מצפים לו כאחד -
  // וסריקת הפקודות עובדת על pre ו-code שקיימים בכל השלושה.
  //
  // מה ששונה הוא ארבעה דברים, והם מרוכזים כאן: איך נראה מזהה שיחה בכתובת,
  // מה עוטף תור בשיחה, מה מסמן הודעה של המשתמש, ואיך נראה כפתור העצירה.
  //
  // כל הבוררים כאן הם תוספת לגנריים ולא החלפה שלהם. בורר שהאתר ישנה מחר
  // יפסיק להתאים, והשאר ימשיך לעבוד - במקום שהתוסף ייפול כולו.
  // ---------------------------------------------------------------------------
  const SITES = {
    gemini: {
      name: 'Gemini',
      hosts: ['gemini.google.com'],
      chatId: (p) => (p[0] === 'app' && p[1]) ? p[1] : null,
      turns: '[data-test-id="conversation-turn"], model-response, message-content, .model-response-text',
      userTurns: '[data-test-id="user-turn"], .user-query, user-message, [data-is-user="true"], user-query-container',
      messages: 'message-content, model-response',
      stop: ['mat-icon[data-mat-icon-name="stop"]', 'mat-icon[fonticon="stop"]']
    },
    claude: {
      name: 'Claude',
      hosts: ['claude.ai'],
      chatId: (p) => (p[0] === 'chat' && p[1]) ? p[1] : null,

      // נמדד באתר החי, לא נוחש. הניחוש הראשון (.font-claude-message,
      // [data-testid="message"]) החזיר אפס על שניהם.
      //
      // המבנה בפועל: [data-test-render-count] עוטף תור, בין של המשתמש ובין
      // של קלוד, וההבחנה היא לפי צאצא user-message. אין מחלקה ייעודית
      // לתשובה, ולכן :has() הוא מה שמבודד אותה - וזה חשוב: בלי הבידול,
      // הסורק היה קורא גם את הודעות המשתמש, כולל ההנחיות שהתוסף עצמו
      // הזריק - ובהן דוגמאות JSON שהיו מורצות כאילו היו פקודות אמיתיות.
      turns: '[data-test-render-count]',
      userTurns: '[data-testid="user-message"]',
      messages: '[data-test-render-count]:not(:has([data-testid="user-message"]))',
      stop: ['button[aria-label*="Stop response" i]']
    },
    chatgpt: {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      chatId: (p) => (p[0] === 'c' && p[1]) ? p[1] : null,
      turns: '[data-testid^="conversation-turn"], article[data-turn], [data-message-author-role]',
      userTurns: '[data-message-author-role="user"]',
      messages: '[data-message-author-role="assistant"]',
      stop: ['button[data-testid="stop-button"]']
    }
  };

  const SITE = (() => {
    const host = location.hostname;
    for (const key of Object.keys(SITES)) {
      if (SITES[key].hosts.includes(host)) return SITES[key];
    }
    // אתר שאינו ברשימה: הגנריים עדיין עובדים, ומזהה השיחה נגזר מהמקטע
    // האחרון בכתובת. עדיף מאשר לא לפעול בכלל.
    return {
      name: host,
      hosts: [host],
      chatId: (p) => (p.length >= 2 ? p[p.length - 1] : null),
      turns: '',
      userTurns: '',
      messages: '',
      stop: []
    };
  })();

  const ACTIVATED_KEY = 'activatedChats';
  let activatedChats = new Set();

  function chatId() {
    // '/app' בלי מזהה הוא כל שיחה חדשה שעוד לא נשמרה - כולן נראות זהות.
    // שמירת המחרוזת הזו ברשימת "הופעל" סימנה בפועל כל שיחה חדשה עתידית
    // כמופעלת, וזו הסיבה שהתוסף התעורר בשיחות שלא ביקשו ממנו כלום.
    // הכיוון ההפוך היה שבור באותה מידה: ברגע שג'מיני משכתב את הכתובת
    // ל-/app/<id> באותה טעינה, השיחה שכן הופעלה איבדה את ההפעלה בשקט.
    const parts = location.pathname.split('/').filter(Boolean);
    // הצורה שונה בכל אתר: ג'מיני /app/<id>, קלוד /chat/<id>, ChatGPT /c/<id>.
    return SITE.chatId(parts);
  }

  // הפעלה שנעשתה בשיחה חדשה שאין לה עדיין מזהה. היא מוחזקת בזיכרון בלבד עד
  // שג'מיני מקצה כתובת, ורק אז נשמרת - כך שהיא נצמדת לשיחה אחת, לא לכולן.
  //
  // התוקף קצוב בכוונה. מבחינת הכתובת בלבד, "שיחה חדשה שקיבלה מזהה" ו"מעבר
  // לשיחה קיימת" נראים זהים: בשני המקרים /app הופך ל-/app/<id>. ההבדל הוא
  // בזמן - השכתוב קורה שניות אחרי שההנחיה נשלחת. בלי החלון הזה, הפעלה
  // שנתקעה הייתה נצמדת לשיחה הבאה שתיפתח, כלומר בדיוק הבאג שתוקן כאן.
  const PENDING_ACTIVATION_TTL_MS = 2 * 60 * 1000;
  let pendingActivation = false;
  let pendingActivationAt = 0;

  function isChatActivated() {
    const id = chatId();
    // כל עוד אנחנו באותה שיחה חסרת-מזהה, ההפעלה תקפה בלי הגבלת זמן. חלון
    // הזמן נוגע רק להצמדה למזהה חדש, אחרת התוסף היה נכבה באמצע שיחה פעילה.
    return id === null ? pendingActivation : activatedChats.has(id);
  }

  async function markChatActivated() {
    const id = chatId();
    if (id === null) {
      pendingActivation = true;
      pendingActivationAt = Date.now();
      return;
    }
    pendingActivation = false;
    activatedChats.add(id);
    try {
      const store = await chrome.storage.local.get([ACTIVATED_KEY]);
      const list = Array.isArray(store[ACTIVATED_KEY]) ? store[ACTIVATED_KEY] : [];
      if (!list.includes(id)) {
        // תקרה: רשימה שגדלה בלי גבול תיצור אחסון שמנפח את עצמו לנצח.
        await chrome.storage.local.set({ [ACTIVATED_KEY]: [...list, id].slice(-200) });
      }
    } catch (e) { /* אחסון שנכשל לא יעצור הפעלה */ }
  }

  async function loadActivatedChats() {
    try {
      const store = await chrome.storage.local.get([ACTIVATED_KEY]);
      if (!Array.isArray(store[ACTIVATED_KEY])) return;
      // מיגרציה מהפורמט הקודם, שבו נשמר location.pathname המלא. הערך '/app'
      // הבודד הוא בדיוק מה שגרם לדליפה ולכן נזרק; '/app/<id>' מומר למזהה.
      let changed = false;
      const migrated = [];
      for (const entry of store[ACTIVATED_KEY]) {
        if (typeof entry !== 'string') { changed = true; continue; }
        const seg = entry.split('/').filter(Boolean);
        const m = (seg[0] === 'app' && seg[1] && seg.length === 2) ? seg[1] : null;
        if (m) { migrated.push(m); changed = true; }
        else if (entry.startsWith('/app')) { changed = true; }
        else migrated.push(entry);
      }
      activatedChats = new Set(migrated);
      if (changed) {
        try {
          await chrome.storage.local.set({ [ACTIVATED_KEY]: migrated.slice(-200) });
        } catch (e) { /* המיגרציה בזיכרון תקפה גם בלי הכתיבה */ }
      }
    } catch (e) { /* נשארים עם מה שיש בזיכרון */ }
  }

  // ג'מיני הוא SPA: מעבר בין שיחות, ושכתוב '/app' ל-'/app/<id>' אחרי ההודעה
  // הראשונה, קורים בלי טעינה מחדש ובלי שאיש מודיע על כך. אין כאן טעם לעטוף
  // את history.pushState - התוסף רץ בעולם מבודד, והעטיפה שלו לא תראה קריאות
  // של הדף עצמו. popstate כן מגיע, והשאר נסגר בבדיקה תקופתית זולה.
  function watchChatChanges() {
    let lastPath = location.pathname;
    const onMaybeChanged = () => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      if (!pendingActivation) return;
      if (Date.now() - pendingActivationAt > PENDING_ACTIVATION_TTL_MS) {
        pendingActivation = false;
        return;
      }
      if (chatId() !== null) {
        markChatActivated();
        addLog('ההפעלה נצמדה לשיחה הזו');
      }
    };
    window.addEventListener('popstate', onMaybeChanged);
    setInterval(onMaybeChanged, 1000);
  }

  // מזהה השיחה נכנס למפתח, אחרת אותה פקודה בשתי שיחות שונות הייתה נחסמת.
  function buildCallKey(toolCall) {
    return `${chatId() || 'new'}|${toolCall.service}_${toolCall.action}_${JSON.stringify(toolCall)}`;
  }

  // תפיסה חוצת-לשוניות לפני ביצוע.
  //
  // רשימת "כבר טופל" הייתה מקומית לכל content script. שתי לשוניות פתוחות על
  // אותה שיחה סרקו את אותו בלוק JSON ושתיהן ירו, כלומר מחיקה או העתקה בוצעו
  // פעמיים - ועם Auto-Run דלוק זה קורה בלי שנשאלת. ה-service worker הוא
  // נקודת הסנכרון היחידה שכל הלשוניות רואות.
  async function claimThenHandle(callKey, toolCall, forceRescan) {
    // סריקה ידנית היא בקשה מפורשת של המשתמש בלשונית הזו, ולכן עוקפת תפיסה.
    if (!forceRescan) {
      try {
        const res = await chrome.runtime.sendMessage({ action: 'CLAIM_TOOL_CALL', key: callKey });
        if (res && res.claimed === false) {
          addLog('⏭️ לשונית אחרת כבר מטפלת בפקודה הזו - מדלגים.');
          return;
        }
      } catch (e) {
        // ה-worker לא ענה. עדיף לבצע מאשר להיתקע בלי שהמשתמש מבין למה.
      }
    }
    inFlightCallKey = callKey;
    handleDetectedToolCall(toolCall);
  }

  function extractFirstJsonObject(str) {
    let openBraces = 0;
    let startIndex = -1;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      // מחוץ לאובייקט אין מחרוזות שצריך לעקוב אחריהן. קודם מצב המחרוזת נספר
      // על פני כל הטקסט, ולכן מספר אי-זוגי של גרשיים בפרוזה שלפני הבלוק -
      // דבר שג'מיני כותב דרך קבע - נעל את הפרסר על inString=true, וכל
      // הסוגריים שאחריו התעלמו. משם הפקודה פשוט לא נמצאה, בלי שום הודעה.
      if (openBraces === 0) {
        if (char === '{') {
          startIndex = i;
          openBraces = 1;
          inString = false;
          isEscaped = false;
        }
        // '}' תועה לפני תחילת האובייקט מדולג. קודם הוא הוריד את המונה אל
        // מתחת לאפס, ואז התנאי openBraces === 0 לא יכול היה להתקיים שוב.
        continue;
      }

      if (char === '"' && !isEscaped) inString = !inString;
      isEscaped = (char === '\\' && !isEscaped);
      if (inString) continue;

      if (char === '{') {
        openBraces++;
      } else if (char === '}') {
        openBraces--;
        if (openBraces === 0 && startIndex !== -1) {
          const candidate = str.substring(startIndex, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (e) {
            // ממשיכים לחפש את המועמד הבא, עם מצב נקי לגמרי
            startIndex = -1;
            inString = false;
            isEscaped = false;
          }
        }
      }
    }
    return null;
  }

  function parseToolCall(rawText) {
    try {
      const parsed = extractFirstJsonObject(rawText);
      if (!parsed || typeof parsed !== 'object') return null;

      // איחוד ושטוח פרמטרים מ-payload, parameters, arguments, params
      const subObj = parsed.payload || parsed.parameters || parsed.arguments || parsed.params || parsed.args || {};
      if (typeof subObj === 'object') {
        for (const [key, val] of Object.entries(subObj)) {
          if (parsed[key] === undefined) {
            parsed[key] = val;
          }
        }
      }

      // נרמול שמות פעולות (Normalizing action aliases)
      let action = parsed.action || parsed.tool_name || parsed.tool || '';
      if (action.startsWith('supabase:') || action.startsWith('github:') || action.startsWith('windows:') || action.startsWith('notion:') || action.startsWith('fetch:') || action.startsWith('custom:')) {
        const parts = action.split(':');
        if (!parsed.service) parsed.service = parts[0];
        action = parts.slice(1).join(':');
      }

      if (action === 'open_application' || action === 'launch_app') action = 'open_app';
      if (action === 'execute_command' || action === 'run_powershell' || action === 'powershell') action = 'run_command';
      if (action === 'sql' || action === 'query' || action === 'run_sql') action = 'execute_sql';
      parsed.action = action;

      // השלמת פרמטרים חסרים
      if (!parsed.query && parsed.sql) parsed.query = parsed.sql;
      if (!parsed.app_name && parsed.name) parsed.app_name = parsed.name;
      if (!parsed.command && parsed.cmd) parsed.command = parsed.cmd;
      if (!parsed.path && parsed.file) parsed.path = parsed.file;

      // נרמול שמות יישומים נפוצים
      if (parsed.app_name) {
        const appLow = parsed.app_name.toLowerCase().trim();
        if (appLow === 'calculator' || appLow === 'calc' || appLow === 'מחשבון') parsed.app_name = 'calc';
        else if (appLow === 'notepad' || appLow === 'פנקס רשימות') parsed.app_name = 'notepad';
        else if (appLow === 'explorer' || appLow === 'סייר הקבצים') parsed.app_name = 'explorer';
        else if (appLow === 'chrome' || appLow === 'כרום') parsed.app_name = 'chrome';
        else if (appLow === 'camera' || appLow === 'מצלמה') parsed.app_name = 'camera';
        else if (appLow === 'paint' || appLow === 'צייר') parsed.app_name = 'paint';
        else if (appLow === 'settings' || appLow === 'הגדרות') parsed.app_name = 'settings';
        else if (appLow === 'clock' || appLow === 'שעון') parsed.app_name = 'clock';
      }
      
      // תוכנית: שומרים על המערך כמו שהוא ומסמנים כשירות windows
      if (Array.isArray(parsed.plan) && parsed.plan.length) {
        parsed.service = normalizeServiceName(parsed.service || 'windows');
        return parsed;
      }

      // נרמול וזיהוי שירות אוטומטי
      if (parsed.service) {
        parsed.service = normalizeServiceName(parsed.service);
      } else {
        if (parsed.action && parsed.action.startsWith('windows')) parsed.service = 'windows';
        else if (['read_file', 'write_file', 'list_directory', 'run_command', 'open_app', 'clipboard_read', 'clipboard_write'].includes(parsed.action) || parsed.app_name) parsed.service = 'windows';
        else if (parsed.action && (parsed.action.startsWith('github') || ['get_file', 'list_repos', 'create_issue'].includes(parsed.action))) parsed.service = 'github';
        else if (parsed.action && (parsed.action.startsWith('fetch') || ['get_url'].includes(parsed.action))) parsed.service = 'fetch';
        else if (parsed.action && (parsed.action.startsWith('notion') || ['get_page', 'create_page', 'search_notion', 'search', 'list_pages', 'get_pages'].includes(parsed.action))) parsed.service = 'notion';
        else if (parsed.action === 'execute_sql' || parsed.action === 'list_tables' || parsed.action === 'get_schema' || parsed.query) parsed.service = 'supabase';
        else parsed.service = 'windows';
      }

      return parsed;
    } catch (e) {
      console.warn('[GemMCP] Error parsing tool call:', e);
    }
    return null;
  }

  // מילון אייקונים ושמות ידידותיים עבור שירותי MCP
  const GITHUB_OFFICIAL_ICON_SVG = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:middle;display:inline-block;" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`;
  const NOTION_OFFICIAL_ICON_SVG = `<svg viewBox="0 0 122 122" style="width:16px;height:16px;vertical-align:middle;display:inline-block;" fill="none"><path d="M6 12.5 74.5 7.5c8.4-.7 10.6-.2 15.9 3.6l21.9 15.4c3.6 2.6 4.8 3.3 4.8 6.2v83.4c0 5.3-1.9 8.4-8.6 8.9l-79.5 4.8c-5.1.2-7.5-.5-10.2-3.8L4.7 105.9C1.8 102 .6 99.1.6 95.7V21.4C.6 17.1 2.5 13.5 6 12.5Z" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M74.5 7.5 6 12.5C2.5 13.5.6 17.1.6 21.4v74.3c0 3.4 1.2 6.3 4.1 10.2l14.1 18.3c2.7 3.3 5.1 4 10.2 3.8l79.5-4.8c6.7-.5 8.6-3.6 8.6-8.9V32.7c0-2.7-1.1-3.5-4.3-5.8l-.5-.4-21.9-15.4c-5.3-3.8-7.5-4.3-15.9-3.6ZM31 24.4c-6.5.4-8 .5-11.7-2.5L9.9 14.4c-1-1-.5-2.2.9-2.4l65.9-4.8c5.5-.5 8.4 1.4 10.6 3.1l11.4 8.2c.3.2 1.1 1.2.1 1.2l-68 4.1-.2.1ZM23.4 111V39.3c0-3.1 1-4.6 3.9-4.8l78-4.6c2.7-.2 3.9 1.5 3.9 4.6v71.2c0 3.1-.5 5.8-4.8 6l-74.6 4.3c-4.3.2-6.4-1.2-6.4-5Zm73.7-68c.5 2.2 0 4.3-2.2 4.6l-3.6.7v52.8c-3.1 1.7-6 2.7-8.4 2.7-3.9 0-4.8-1.2-7.7-4.8L51.5 61.9v35.9l7.5 1.7s0 4.3-6 4.3l-16.6 1c-.5-1 0-3.4 1.7-3.9l4.3-1.2V50.5l-6-.5c-.5-2.2.7-5.3 4.1-5.5l17.8-1.2 24.5 37.5V47.6l-6.3-.7c-.5-2.7 1.4-4.6 3.9-4.8l17-1Z" fill="#000000"/></svg>`;

  const SERVICE_UI_INFO = {
    supabase: { name: 'Supabase Database', icon: '⚡', actionLabel: 'הרצת שאילתת SQL' },
    windows: { name: 'Windows OS Tools', icon: '🪟', actionLabel: 'פעולת מערכת / קבצים' },
    notion: { name: 'Notion Workspace', icon: NOTION_OFFICIAL_ICON_SVG, actionLabel: 'קריאה/כתיבה ב-Notion' },
    github: { name: 'GitHub Integration', icon: GITHUB_OFFICIAL_ICON_SVG, actionLabel: 'פעולת גיטהאב' },
    fetch: { name: 'Web Fetcher', icon: '🌐', actionLabel: 'סריקת אתר אינטרנט' },
    custom: { name: 'Custom MCP Server', icon: '🔌', actionLabel: 'כלי מותאם אישית' }
  };

  function getServiceInfo(service) {
    const s = normalizeServiceName(service);
    return SERVICE_UI_INFO[s] || { name: `MCP [${service}]`, icon: '🛠️', actionLabel: 'קריאה לכלי' };
  }

  function getActionDescription(toolCall) {
    if (Array.isArray(toolCall.plan) && toolCall.plan.length) {
      return `תוכנית בת ${toolCall.plan.length} שלבים`;
    }
    const action = toolCall.action || toolCall.tool_name || '';
    if (action === 'open_app') return `פתיחת אפליקציה (${toolCall.app_name || ''})`;
    if (action === 'execute_sql') return `שאילתת SQL: ${toolCall.query ? toolCall.query.substring(0, 45) + (toolCall.query.length > 45 ? '...' : '') : ''}`;
    if (action === 'read_file') return `קריאת קובץ: ${toolCall.path || ''}`;
    if (action === 'write_file') return `כתיבה לקובץ: ${toolCall.path || ''}`;
    if (action === 'list_directory') return `סריקת תיקייה: ${toolCall.path || ''}`;
    if (action === 'run_command') return `פקודה: ${toolCall.command || ''}`;
    if (action === 'get_url') return `טעינת כתובת: ${toolCall.url || ''}`;
    if (action === 'list_repos') return 'שליפת רשימת מאגרים';
    if (action === 'search') return `חיפוש ב-Notion: ${toolCall.query || 'הכל'}`;
    return action || 'ביצוע פעולה';
  }

  function renderCollapsibleToolCard(targetEl, toolCall, service) {
    if (!targetEl || targetEl.dataset.omniWidgetInjected === 'true') return;
    if (targetEl.closest('.gemmcp-tool-pill-container, .omni-mcp-panel, #omni-mcp-floating-badge')) return;
    targetEl.dataset.omniWidgetInjected = 'true';

    // מציאת האלמנט העוטף שמציג את הקוד/JSON ב-Gemini
    const codeBlockContainer = targetEl.closest('pre, code-block, .code-block, .formatted-code, .code-container') || targetEl;
    if (codeBlockContainer.closest('.gemmcp-tool-pill-container')) return;
    
    // הסתרת בלוק הקוד המקורי
    codeBlockContainer.style.display = 'none';
    codeBlockContainer.dataset.omniProcessed = 'true';

    const sInfo = getServiceInfo(service);
    const actionDesc = getActionDescription(toolCall);
    const rawJsonStr = JSON.stringify(toolCall, null, 2);

    const widget = document.createElement('div');
    widget.className = 'gemmcp-tool-pill-container';
    widget.dataset.mcpCallId = `${service}_${toolCall.action || ''}`;
    widget.dataset.callCount = '1';
    widget.innerHTML = `
      <div class="gemmcp-tool-pill" title="לחץ להצגה/הסתרה של פרטי השאילתה והתשובה">
        <div class="gemmcp-tool-pill-left">
          <span class="gemmcp-tool-pill-icon">${sInfo.icon}</span>
          <div class="gemmcp-tool-pill-info">
            <span class="gemmcp-tool-pill-title">${escapeHtml(sInfo.name)}</span>
            <span class="gemmcp-tool-pill-subtitle">${escapeHtml(actionDesc)}</span>
          </div>
        </div>
        <div class="gemmcp-tool-pill-right">
          <div class="gemmcp-tool-pill-status running">
            <span class="gemmcp-tool-spinner"></span>
            <span>מבצע...</span>
          </div>
          <span class="gemmcp-tool-chevron">▼</span>
        </div>
      </div>
      <div class="gemmcp-tool-pill-details">
        <div class="gemmcp-step-item">
          <div style="font-weight:700; color:#60a5fa; margin-bottom:4px;">📤 שאילתת MCP:</div>
          <pre style="margin:0 0 6px 0; white-space:pre-wrap; word-break:break-all;">${escapeHtml(rawJsonStr)}</pre>
        </div>
      </div>
    `;

    // לחיצה להרחבה/קיפול
    const pill = widget.querySelector('.gemmcp-tool-pill');
    if (pill) {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.classList.toggle('expanded');
      });
    }

    codeBlockContainer.parentNode.insertBefore(widget, codeBlockContainer.nextSibling);
    return widget;
  }

  function updateToolCardStatus(service, toolCall, isSuccess, errorMsg = '', resultData = null) {
    const widgets = document.querySelectorAll('.gemmcp-tool-pill-container');
    if (!widgets.length) return;

    widgets.forEach((widget) => {
      const statusEl = widget.querySelector('.gemmcp-tool-pill-status');
      if (!statusEl) return;

      if (isSuccess) {
        statusEl.className = 'gemmcp-tool-pill-status done';
        statusEl.innerHTML = `<span>✓</span><span>הושלם</span>`;
        if (resultData) {
          const details = widget.querySelector('.gemmcp-tool-pill-details');
          if (details && !details.innerHTML.includes('gemmcp-section-response')) {
            const formattedData = typeof resultData === 'object' ? JSON.stringify(resultData, null, 2) : String(resultData);
            details.innerHTML += `
              <div class="gemmcp-section-response" style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.15);">
                <div style="font-weight:700; color:#34d399; margin-bottom:6px;">📥 תגובת MCP שהוחזרה ל-Gemini:</div>
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${escapeHtml(formattedData)}</pre>
              </div>
            `;
          }
        }
      } else {
        statusEl.className = 'gemmcp-tool-pill-status error';
        statusEl.innerHTML = `<span>✕</span><span>שגיאה</span>`;
        if (errorMsg) {
          const details = widget.querySelector('.gemmcp-tool-pill-details');
          if (details && !details.innerHTML.includes('gemmcp-section-error')) {
            details.innerHTML += `
              <div class="gemmcp-section-error" style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(239,68,68,0.4);">
                <div style="font-weight:700; color:#f87171; margin-bottom:6px;">⚠️ שגיאה בביצוע:</div>
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all; color:#fca5a5;">${escapeHtml(errorMsg)}</pre>
              </div>
            `;
          }
        }
      }
    });
  }

  function scanAndCollapseUserResponses() {
    // הסתרה מלאה ונקייה של הודעות [MCP_RESPONSE:] של המשתמש (כל ה-Turn או הבועה)
    const candidates = Array.from(document.querySelectorAll('[data-test-id="user-turn"], .user-query, user-message, [data-is-user="true"], user-query-container, .user-query-container, [data-testid="user-message"], [data-message-author-role="user"], [data-test-id="conversation-turn"]'));
    
    for (const node of candidates) {
      if (node.dataset.omniResponseHidden === 'true') continue;
      const text = node.innerText || node.textContent || '';
      if (text.includes('[MCP_RESPONSE:')) {
        node.dataset.omniResponseHidden = 'true';
        // אם מצאנו אלמנט פנימי, נסתיר את כל תור המשתמש החיצוני כדי שלא יישאר בלון ריק
        const userTurn = node.closest('[data-test-id="user-turn"], user-query-container, [data-test-id="conversation-turn"]') || node;
        userTurn.style.display = 'none';
        userTurn.dataset.omniResponseHidden = 'true';

        // הוספת התוצאה לפרטי הווידג'ט המאוחד האחרון
        const allExistingWidgets = document.querySelectorAll('.gemmcp-tool-pill-container');
        if (allExistingWidgets.length > 0) {
          const lastW = allExistingWidgets[allExistingWidgets.length - 1];
          const details = lastW.querySelector('.gemmcp-tool-pill-details');
          if (details && !details.innerHTML.includes('gemmcp-section-response')) {
            details.innerHTML += `
              <div class="gemmcp-section-response" style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.15);">
                <div style="font-weight:700; color:#34d399; margin-bottom:6px;">📥 תגובה שהוחזרה ל-Gemini:</div>
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${escapeHtml(text.trim())}</pre>
              </div>
            `;
          }
        }

        // עדכון סטטוס הווידג'טים להושלם
        updateToolCardStatus('', null, true);
      }
    }
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

  function isServiceActive(service) {
    if (!service) return false;
    const srv = normalizeServiceName(service);
    if (srv === 'custom' || srv.startsWith('custom_')) {
      return activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_'));
    }
    return activeServices.includes(srv);
  }

  function handleDetectedToolCall(toolCall) {
    const service = normalizeServiceName(toolCall.service || 'supabase');
    toolCall.service = service;

    // בדיקה האם השירות דלוק ומורשה לפעול
    if (!isServiceActive(service)) {
      console.log(`[GemMCP] ⏸️ פקודה עבור [${service}] נדחתה כי הכלי מכובה בהגדרות.`);
      addLog(`התעלם מפקודה עבור [${service}] – הכלי כבוי בהגדרות`, { error: false });
      return;
    }

    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    // "אוטונומי" הוא כשלעצמו ההצהרה שהכל רץ לבד, ולכן הוא מדליק את ההרצה
    // האוטומטית בעצמו. קודם אלה היו שני מתגים נפרדים שנדרשו יחד, ואת השני
    // - תיבת הסימון שבווידג'ט - הפופאפ בכלל לא יכול היה להדליק. התוצאה:
    // מי שבחר "אוטונומי" מהפופאפ קיבל בקשת אישור על כל פעולה, כולל קריאה.
    const autoRun = autoRunScope === 'all' ||
      (autoToggle ? autoToggle.checked : isAutoExecute);
    addLog(`זוהתה בקשה מ-${SITE.name} עבור [${service}]: ${toolCall.action || toolCall.tool_name || 'execute'}`);

    // פעולות בלתי הפיכות או בעלות טווח בלתי מוגבל דורשות אישור *תמיד*, גם כאשר
    // ההרצה האוטומטית דלוקה. הרצת PowerShell או כתיבה לקובץ הן לא משהו שכדאי
    // שיקרה בלי שהמשתמש ראה את זה, ומתג נוחות אחד לא צריך לבטל את זה.
    if (autoRun && requiresExplicitApproval(service, toolCall)) {
      addLog(`הפעולה [${toolCall.action}] דורשת אישור גם במצב הרצה אוטומטית`);
      promptUserApproval(service, toolCall);
      return;
    }

    if (autoRun) {
      executeTool(service, toolCall);
    } else {
      promptUserApproval(service, toolCall);
    }
  }

  // ---------------------------------------------------------------------------
  // סיווג סיכון של פעולה. משמש גם לשער האישור הכפוי וגם לצביעת כרטיס האישור.
  // ---------------------------------------------------------------------------
  const ACTION_RISK = {
    run_command:     { level: 'danger',  label: 'הרצת פקודה במערכת', icon: '⚡' },
    write_file:      { level: 'danger',  label: 'כתיבה לקובץ',        icon: '✏️' },
    create_repo:     { level: 'warn',    label: 'יצירת מאגר',         icon: '📦' },
    create_page:     { level: 'warn',    label: 'יצירת דף',           icon: '📝' },
    create_issue:    { level: 'warn',    label: 'פתיחת issue',        icon: '🐛' },
    execute_sql:     { level: 'warn',    label: 'שאילתת SQL',         icon: '🗄️' },
    clipboard_write: { level: 'warn',    label: 'כתיבה ללוח',         icon: '📋' },
    move_file:       { level: 'danger',  label: 'העברת קובץ',         icon: '📦' },
    delete_file:     { level: 'danger',  label: 'מחיקה לסל המיחזור',  icon: '🗑️' },
    copy_file:       { level: 'warn',    label: 'העתקת קובץ',         icon: '📄' },
    make_dir:        { level: 'warn',    label: 'יצירת תיקייה',       icon: '📁' },
    find_files:      { level: 'safe',    label: 'חיפוש קבצים',        icon: '🔍' },
    open_app:        { level: 'safe',    label: 'פתיחת תוכנה',        icon: '🚀' },
    // בתוכנית נקראת הטבלה הזו ישירות, בלי הסיווג הדינמי, ולכן ההנחה כאן
    // היא הזהירה. פעולה בודדת מסווגת לפי מה שהיא באמת מריצה.
    github_cli:      { level: 'danger',  label: 'פעולת GitHub',       icon: '🐙' },
    media_control:   { level: 'safe',    label: 'שליטה בנגן',          icon: '🎵' },
    // הורדה מהאינטרנט מביאה קובץ ממקור חיצוני אל הדיסק. זו כתיבה, והמקור
    // אינו בשליטת המשתמש - ולכן היא בדרג המסוכן ולא ב'שינוי'.
    download_file:   { level: 'danger',  label: 'הורדה מהאינטרנט',     icon: '🌐' },
    // alwaysAsk: לעולם לא רצה לבד, גם במצב אוטונומי. הורדה והרצה של קובץ
    // ממקור שאינו בשליטת המשתמש היא הפעולה היחידה כאן שמצדיקה חריגה
    // מפורשת מהמצב שנבחר.
    install_from_url:{ level: 'danger',  label: 'הורדה והתקנה',        icon: '📦', alwaysAsk: true },
    // דורש אישור ולא רץ אוטומטית: רשימת החלונות מגלה כותרות של מסמכים, מיילים
    // וכתובות פרטיות, והתוצאה נשלחת לג'מיני - כלומר החוצה. אין לה גם שום תיחום
    // לתיקייה מותרת, בניגוד ל-list_directory.
    manage_windows:  { level: 'warn',    label: 'חלונות פתוחים',       icon: '🪟' },
    read_file:       { level: 'safe',    label: 'קריאת קובץ',         icon: '📄' },
    list_directory:  { level: 'safe',    label: 'סריקת תיקייה',       icon: '📂' },
    clipboard_read:  { level: 'safe',    label: 'קריאת הלוח',         icon: '📋' },
    get_url:         { level: 'safe',    label: 'משיכת דף אינטרנט',   icon: '🌐' },
    list_tables:     { level: 'safe',    label: 'רשימת טבלאות',       icon: '🗄️' },
    get_schema:      { level: 'safe',    label: 'סכימת מסד נתונים',   icon: '🗄️' },
    list_repos:      { level: 'safe',    label: 'רשימת מאגרים',       icon: '📦' },
    get_file:        { level: 'safe',    label: 'קריאת קובץ מ-GitHub', icon: '📄' },
    get_page:        { level: 'safe',    label: 'קריאת דף',           icon: '📝' },
    search:          { level: 'safe',    label: 'חיפוש',              icon: '🔍' }
  };

  const PLAN_RISK_ORDER = { safe: 0, warn: 1, danger: 2 };

  // תת-פקודות של gh שאינן משנות דבר. הרשימה מקבילה לזו שבשרת - שם היא
  // נאכפת, כאן היא רק מחליטה אם להראות כרטיס אישור.
  const GH_READ_SUBCOMMANDS = new Set(['list', 'view', 'status', 'diff', 'checks', 'search', 'download', 'ls']);
  const GH_READ_COMMANDS = new Set(['status', 'search', 'browse']);

  function classifyGithubCli(toolCall) {
    const p = toolCall.params && typeof toolCall.params === 'object' ? toolCall.params : toolCall;
    const args = Array.isArray(p.args) ? p.args : [];
    const cmd = String(args[0] || '').toLowerCase();
    const sub = String(args[1] || '').toLowerCase();
    const readOnly = GH_READ_COMMANDS.has(cmd) || GH_READ_SUBCOMMANDS.has(sub);
    const label = ('GitHub: ' + cmd + ' ' + sub).trim();
    // מסוכן, אך בלי alwaysAsk. מחיקת מאגר אינה חמורה יותר ממחיקת קובץ,
    // וזו כבר רצה במצב אוטונומי - החרגה כאן הייתה חוסר עקביות ולא הגנה.
    return readOnly ? { level: 'safe', label, icon: '🐙' }
                    : { level: 'danger', label, icon: '🐙' };
  }

  function classifyAction(toolCall) {
    // github_cli מסוכן או בטוח לפי מה שהוא מריץ, לא לפי שמו: gh repo list
    // ו-gh repo delete הן אותה פעולה בטבלה, ולסווג אותן יחד פירושו או
    // לעצור על הכל או לא לעצור על כלום.
    const bare = String(toolCall.action || toolCall.tool_name || '').replace(/^[a-z]+:/, '');
    if (bare === 'github_cli') return classifyGithubCli(toolCall);

    // תוכנית מקבלת את דרגת הסיכון של השלב המסוכן ביותר שבה. אחרת שלב הרסני
    // אחד היה מסתתר בתוך רשימה שנראית תמימה.
    if (Array.isArray(toolCall.plan) && toolCall.plan.length) {
      let worst = { level: 'safe', label: '', icon: '' };
      // alwaysAsk של שלב בודד חייב לשרוד את הסיכום. בלי זה תוכנית שמכילה
      // install_from_url בנתה אובייקט סיכון חדש בלי הדגל, עברה את השער
      // ב-requiresExplicitApproval, והתקינה קובץ מהאינטרנט בלי לשאול -
      // כלומר עטיפה בתוכנית עקפה את האישור שהפעולה הזו דורשת תמיד.
      let alwaysAsk = false;
      for (const step of toolCall.plan) {
        const r = ACTION_RISK[String(step.action || '').replace(/^[a-z]+:/, '')] ||
                  { level: 'warn', label: step.action || 'פעולה', icon: '❓' };
        if (r.alwaysAsk) alwaysAsk = true;
        if (PLAN_RISK_ORDER[r.level] > PLAN_RISK_ORDER[worst.level]) worst = r;
      }
      return {
        level: worst.level,
        label: `תוכנית בת ${toolCall.plan.length} שלבים`,
        icon: worst.level === 'danger' ? '⚡' : (worst.level === 'warn' ? '📋' : '📋'),
        alwaysAsk
      };
    }
    const action = String(toolCall.action || toolCall.tool_name || '').replace(/^[a-z]+:/, '');
    // פעולה שאינה בטבלה מסומנת ככזו. קודם היא התמזגה בשקט לדרג 'שינוי', ובמצב
    // האוטונומי זה אומר שפעולה חדשה לגמרי - שאיש לא סיווג ואיש לא יודע מה היא
    // עושה - הייתה רצה בלי לשאול.
    return ACTION_RISK[action] || { level: 'warn', label: action || 'פעולה', icon: '❓', unknown: true };
  }

  // תיאור אנושי של כל שלב בתוכנית, לפי הסדר
  function describePlan(service, toolCall) {
    return toolCall.plan.map((step, i) => {
      const r = ACTION_RISK[String(step.action || '').replace(/^[a-z]+:/, '')] ||
                { level: 'warn', icon: '❓' };
      return `${i + 1}. ${r.icon} ${describeAction(service, step)}`;
    }).join('\n');
  }

  function requiresExplicitApproval(service, toolCall) {
    const scope = (typeof autoRunScope !== 'undefined') ? autoRunScope : 'read';

    // פעולה שסומנה alwaysAsk עוצרת לאישור בכל מצב. זה גובר גם על אוטונומי,
    // כי הורדה והרצה של קובץ מהרשת היא לא משהו שצריך לקרות בלי שראית אותו.
    if (classifyAction(toolCall).alwaysAsk) return true;

    // מצב אוטונומי: שום דבר אינו נעצר לאישור, כולל הרצת פקודות, מחיקה
    // ותוכניות. זו בחירה מפורשת של המשתמש, מאחורי מתג שכבוי כברירת מחדל.
    //
    // מה שממשיך להגן כאן אינו הכרטיס אלא השרת: תקרת ההרשאות ב-.env ותיחום
    // הנתיב נאכפים בכל בקשה ואינם מושפעים מהמצב הזה כלל. כלומר גם כאן פעולה
    // לא תצא מהתיקייה המורשית, ולא תריץ פקודות אם ההרשאה כבויה בשרת.
    if (scope === 'all') return false;

    // תוכנית תמיד עוברת אישור במצב הבטוח: היא מבצעת כמה פעולות ברצף, וזה
    // בדיוק המקרה שבו כדאי לראות מה עומד לקרות לפני שזה קורה.
    if (Array.isArray(toolCall.plan) && toolCall.plan.length) return true;

    const risk = classifyAction(toolCall);
    // פעולה שאינה מוכרת: אין סיווג, ולכן אין בסיס להחליט שהיא בטוחה.
    if (risk.unknown) return true;
    return risk.level !== 'safe';
  }

  // תיאור הפעולה בשפה אנושית, כדי שלא יהיה צריך לקרוא JSON כדי להחליט
  function describeAction(service, toolCall) {
    const t = (v) => (v === undefined || v === null ? '' : String(v));
    const action = String(toolCall.action || toolCall.tool_name || '').replace(/^[a-z]+:/, '');
    switch (action) {
      case 'open_app':        return `לפתוח את התוכנה "${t(toolCall.app_name)}"`;
      case 'media_control':   return `לשלוח פקודת מדיה: ${t(toolCall.command)}`;
      case 'download_file':   return `להוריד מהאינטרנט: ${t(toolCall.url)}`;
      case 'install_from_url': return `להוריד ולהתקין מ: ${t(toolCall.url)}`;
      case 'github_cli': {
        // הכרטיס חייב להראות את הפקודה המלאה. "פעולת GitHub" לבדה אינו
        // מספיק כדי להחליט, כשההבדל בין list ל-delete הוא כל העניין.
        const p = toolCall.params && typeof toolCall.params === 'object' ? toolCall.params : toolCall;
        const args = Array.isArray(p.args) ? p.args : [];
        return `להריץ ב-GitHub: gh ${t(args.join(' '))}`;
      }
      case 'manage_windows':  return toolCall.command === 'focus'
                                ? `להביא לקדמת המסך את "${t(toolCall.app_name)}"`
                                : 'לקבל את רשימת החלונות הפתוחים';
      case 'find_files':      return `לחפש "${t(toolCall.pattern)}" תחת ${t(toolCall.path)}`;
      case 'make_dir':        return `ליצור את התיקייה ${t(toolCall.path)}`;
      case 'copy_file':       return `להעתיק ${t(toolCall.from)} אל ${t(toolCall.to)}`;
      case 'move_file':       return `להעביר ${t(toolCall.from)} אל ${t(toolCall.to)}`;
      case 'delete_file':     return `למחוק לסל המיחזור: ${t(toolCall.path)}`;
      case 'read_file':       return `לקרוא את הקובץ ${t(toolCall.path)}`;
      case 'list_directory':  return `לסרוק את התיקייה ${t(toolCall.path)}`;
      case 'write_file':      return `לכתוב ${t(toolCall.content).length} תווים לקובץ ${t(toolCall.path)}`;
      case 'run_command':     return `להריץ ב-PowerShell: ${t(toolCall.command)}`;
      case 'clipboard_read':  return 'לקרוא את תוכן לוח ההעתקה';
      case 'clipboard_write': return `להעתיק ללוח: "${t(toolCall.text).slice(0, 80)}"`;
      case 'get_url':         return `למשוך את הכתובת ${t(toolCall.url)}`;
      case 'execute_sql':     return `להריץ שאילתה: ${t(toolCall.query).slice(0, 120)}`;
      case 'create_page':     return `ליצור דף בשם "${t(toolCall.title)}"`;
      case 'create_repo':     return `ליצור מאגר בשם "${t(toolCall.name)}"`;
      case 'create_issue':    return `לפתוח issue "${t(toolCall.title)}" ב-${t(toolCall.repo)}`;
      default:                return `להריץ ${action} בשירות ${service}`;
    }
  }

  function promptUserApproval(service, toolCall) {
    const container = document.getElementById('omni-mcp-pending-actions');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'omni-mcp-query-card';
    card.innerHTML = `
      <div class="omni-mcp-query-header">
        <span>בקשת פעולה מג'מיני</span>
        <span style="color:#60a5fa;">[${service}] ${toolCall.action || ''}</span>
      </div>
    `;

    const risk = classifyAction(toolCall);
    const RISK_STYLE = {
      safe:   { border: '#2563a8', bg: 'rgba(37,99,168,.12)',  text: '#93c5fd', word: 'קריאה' },
      warn:   { border: '#b45309', bg: 'rgba(180,83,9,.14)',   text: '#fcd34d', word: 'שינוי' },
      danger: { border: '#b91c1c', bg: 'rgba(185,28,28,.16)',  text: '#fca5a5', word: 'מסוכן' }
    };
    const style = RISK_STYLE[risk.level] || RISK_STYLE.warn;
    card.style.borderInlineStartWidth = '4px';
    card.style.borderInlineStartStyle = 'solid';
    card.style.borderInlineStartColor = style.border;

    // שורת סיווג + תיאור אנושי
    const summary = document.createElement('div');
    summary.style.cssText = 'display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin:7px 0 4px;';
    summary.innerHTML = `
      <span style="background:${style.bg}; color:${style.text}; border:1px solid ${style.border};
                   font-size:10px; font-weight:700; padding:2px 7px; border-radius:6px;">
        ${risk.icon} ${escapeHtml(style.word)}
      </span>
      <span style="font-size:12px; color:#e2e8f0; font-weight:600;">${escapeHtml(risk.label)}</span>
    `;
    card.appendChild(summary);

    const human = document.createElement('div');
    human.style.cssText = 'font-size:12.5px; line-height:1.6; color:#cbd5e1; margin:2px 0 8px; word-break:break-word; white-space:pre-line;';
    human.textContent = Array.isArray(toolCall.plan) && toolCall.plan.length
      ? describePlan(service, toolCall)
      : describeAction(service, toolCall);
    card.appendChild(human);

    // תצוגה מקדימה של התוכן שעומד להיכתב, במקום רק שם הקובץ
    const action = String(toolCall.action || '').replace(/^[a-z]+:/, '');
    if (action === 'write_file' && typeof toolCall.content === 'string') {
      const preview = document.createElement('details');
      preview.style.cssText = 'margin-bottom:8px;';
      const body = toolCall.content.length > 1200
        ? toolCall.content.slice(0, 1200) + `\n… (עוד ${toolCall.content.length - 1200} תווים)`
        : toolCall.content;
      preview.innerHTML = `
        <summary style="cursor:pointer; font-size:11.5px; color:#93c5fd; font-weight:600;">
          תצוגה מקדימה של התוכן (${toolCall.content.length} תווים)
        </summary>
        <div class="omni-mcp-sql-preview" style="margin-top:6px; max-height:190px; overflow:auto;">${escapeHtml(body)}</div>
      `;
      card.appendChild(preview);
    }

    // ה-JSON המלא נשאר זמין, אבל מקופל - הוא לא מה שמכריע את ההחלטה
    const raw = document.createElement('details');
    raw.style.cssText = 'margin-bottom:9px;';
    raw.innerHTML = `
      <summary style="cursor:pointer; font-size:11px; color:#94a3b8;">הצג JSON מלא</summary>
      <div class="omni-mcp-sql-preview" style="margin-top:6px;">${escapeHtml(JSON.stringify(toolCall, null, 2))}</div>
    `;
    card.appendChild(raw);

    const btns = document.createElement('div');
    btns.className = 'omni-mcp-btn-group';
    btns.innerHTML = `
      <button class="omni-mcp-btn-approve">אשר והרץ <span style="opacity:.65; font-size:10px;">Enter</span></button>
      <button class="omni-mcp-btn-reject">בטל <span style="opacity:.65; font-size:10px;">Esc</span></button>
    `;
    card.appendChild(btns);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10.5px; color:#64748b; margin-top:6px;';
    card.appendChild(hint);

    const approveBtn = card.querySelector('.omni-mcp-btn-approve');
    const rejectBtn = card.querySelector('.omni-mcp-btn-reject');

    // סוגר את הפאנל רק אם לא נשארו בקשות אישור נוספות שממתינות
    function closeIfNoPendingCards() {
      if (!container.querySelector('.omni-mcp-query-card')) closePanel();
    }

    // כרטיס שנשכח על המסך הוא כרטיס שיאושר בהיסח הדעת מתישהו. פעולות מסוכנות
    // מתבטלות מעצמן אם לא הוכרעו, ופעולות קריאה מקבלות חלון ארוך יותר.
    const TIMEOUT_MS = risk.level === 'danger' ? 45000 : 120000;
    let remaining = Math.round(TIMEOUT_MS / 1000);
    let settled = false;

    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        reject('הפעולה בוטלה אוטומטית: לא התקבל אישור בזמן.');
      } else {
        hint.textContent = `יתבטל אוטומטית בעוד ${remaining} שניות`;
      }
    }, 1000);
    hint.textContent = `יתבטל אוטומטית בעוד ${remaining} שניות`;

    function cleanup() {
      settled = true;
      clearInterval(tick);
      document.removeEventListener('keydown', onKey, true);
      card.remove();
      closeIfNoPendingCards();
    }

    function approve() {
      if (settled) return;
      cleanup();
      executeTool(service, toolCall);
    }

    function reject(reason) {
      if (settled) return;
      cleanup();
      // דחייה אינה ביצוע, ולכן היא חייבת לשחרר את המפתח: אחרת בקשה חוזרת
      // של אותה פעולה - אחרי שדחית אותה בטעות - לא הייתה נקלטת שוב.
      releaseCallKey();
      sendResponseToGemini(service, { error: reason || 'הפעולה בוטלה על ידי המשתמש.' });
      addLog(reason || 'הפעולה בוטלה ע"י המשתמש', { error: false });
    }

    // קיצורי מקלדת.
    //
    // המאזין רשום ברמת המסמך, ולכן אם פתוחים כמה כרטיסים לחיצה אחת על Enter
    // הייתה מפעילה את כולם. לכן הוא פועל רק על הכרטיס הראשון בתור, וגם רק
    // כשאין פוקוס בשדה טקסט - אחרת היה חוטף Enter מהקלדה רגילה בקומפוזר.
    function isFrontCard() {
      return container.querySelector('.omni-mcp-query-card') === card;
    }

    function onKey(e) {
      if (settled || !isFrontCard()) return;

      const el = document.activeElement;
      const inField = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (inField) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        approve();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        reject();
      }
    }
    document.addEventListener('keydown', onKey, true);

    approveBtn.addEventListener('click', approve);
    rejectBtn.addEventListener('click', () => reject());

    container.appendChild(card);
    openPanel();

    // לא נותנים פוקוס לכפתור האישור: זה גם גוזל פוקוס מהקומפוזר של ג'מיני באמצע
    // הקלדה, וגם הופך רווח לאישור של פעולה שעלולה להיות הרסנית.
  }

  function executeTool(service, toolCall) {
    if (isExecuting) {
      console.log('[GemMCP] Tool already executing, waiting...');
      return;
    }
    isExecuting = true;
    setBadgeBusy(true);

    // מנגנון הגנה: איפוס אוטומטי של הנעילה אחרי 6 שניות כדי שהתוסף לעולם לא ייתקע
    const executionTimeout = setTimeout(() => {
      if (isExecuting) {
        console.warn('[GemMCP] Safety timeout reached, resetting execution state');
        addLog(`שגיאה ב-[${service}]: פקודה הסתיימה עקב Timeout. וודא ששרת ה-Bridge מופעל ב-http://127.0.0.1:3000`);
        sendResponseToGemini(service, {
          status: "error",
          error: `הפעולה נכשלה עקב Timeout. וודא ששרת ה-Bridge המקומי (node server.js) רץ במחשב.`
        });
        isExecuting = false;
        setBadgeBusy(false);
        releaseCallKey();
      }
    }, 45000);

    addLog(`מבצע שירות [${service}]...`);

    if (!chrome.runtime || !chrome.runtime.id) {
      addLog('התוסף עודכן ברקע. נא לרענן את העמוד (F5).');
      clearTimeout(executionTimeout);
      isExecuting = false;
      setBadgeBusy(false);
      releaseCallKey();
      return;
    }

    try {
      chrome.storage.sync.get(null, (config) => {
        if (chrome.runtime.lastError) {
          addLog(`נא לרענן את הדף (F5) לסנכרון התוסף`);
          clearTimeout(executionTimeout);
          isExecuting = false;
          setBadgeBusy(false);
          releaseCallKey();
          return;
        }

        chrome.runtime.sendMessage(
          {
            action: 'EXECUTE_MCP_TOOL',
            service: service,
            toolCall: toolCall,
            config: config || {}
          },
          (response) => {
            clearTimeout(executionTimeout);
            releaseCallKey();
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              const errMsg = lastErr.message || 'שגיאת תקשורת עם התוסף';
              addLog(`שגיאה ב-[${service}]: ${errMsg}`);
              updateToolCardStatus(service, toolCall, false, errMsg);
              sendResponseToGemini(service, {
                status: "error",
                error: errMsg
              });
            } else if (response && response.success) {
              addLog(`הפעולה עבור [${service}] הצליחה! מחזיר לג'מיני...`);
              // התקנה מחזירה מזהה משימה. מציגים כפתור ביטול כל עוד יש מה
              // לבטל, כי אחרי שהמתקין כבר סיים אין דרך לחזור אחורה - וזה
              // בדיוק החלון שבו המשתמש עשוי לחשוב שוב.
              if (response.data && response.data.jobId) {
                showInstallCancelCard(response.data);
              }
              updateToolCardStatus(service, toolCall, true, '', response.data);
              sendResponseToGemini(service, {
                status: "success",
                action: toolCall.action,
                data: response.data
              });
            } else {
              const errorMsg = response ? response.error : 'שגיאת ביצוע בשרת המקומי';
              if (service === 'windows' && (errorMsg.includes('127.0.0.1') || errorMsg.includes('Bridge Server'))) {
                triggerBridgeStartupProtocol();
              }
              addLog(`שגיאה ב-[${service}]: ${errorMsg}`);
              updateToolCardStatus(service, toolCall, false, errorMsg);
              sendResponseToGemini(service, {
                status: "error",
                error: errorMsg
              });
            }
            setTimeout(() => {
              isExecuting = false;
              setBadgeBusy(false);
            }, 800);
          }
        );
      });
    } catch (e) {
      clearTimeout(executionTimeout);
      addLog('נא לרענן את הלשונית (F5)');
      isExecuting = false;
      setBadgeBusy(false);
    }
  }

  function sendResponseToGemini(service, resultData) {
    const inputField = findGeminiInputField();
    if (!inputField) return;

    const formattedResponse = `[MCP_RESPONSE: ${service}]\n\`\`\`json\n${JSON.stringify(resultData, null, 2)}\n\`\`\`\nנתח את התוצאות הנ"ל וענה למשתמש בשפה טבעית וברורה.`;
    setInputValueAndSend(inputField, formattedResponse);
  }

  // ההעשרה מחליפה את תוכן הקומפוזר באמצע טיפול באירוע השליחה. בעבר האירוע
  // המקורי המשיך לג'מיני מיד לאחר מכן, לפני שהמודל של Angular הספיק להתעדכן,
  // וג'מיני שלח תוכן לא מסונכרן - מה שנראה כמו Enter ש"נבלע". כעת עוצרים את
  // האירוע המקורי, מעשירים, ומפעילים את השליחה מחדש אחרי שהמודל התעדכן.
  const ENRICH_SEND_DELAY_MS = 150;

  function suppressAndResend(e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    setTimeout(() => {
      if (!clickGeminiSendButton()) {
        addLog('ההעשרה בוצעה אך לא נמצא כפתור שליחה – שלח ידנית');
      }
    }, ENRICH_SEND_DELAY_MS);
  }

  function attachUserIntentInterceptor() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const inputField = findGeminiInputField();
      if (!inputField) return;
      if (!(document.activeElement === inputField || inputField.contains(document.activeElement))) return;

      // אם לא היה מה להעשיר - לא נוגעים באירוע, ג'מיני שולח כרגיל
      if (enrichInputIfNeeded(inputField)) suppressAndResend(e);
    }, true);

    document.addEventListener('click', (e) => {
      const sendBtn = e.target.closest('button.send-button, button[aria-label*="שלח"], button[aria-label*="Send"], .send-button-container button');
      if (!sendBtn) return;
      const inputField = findGeminiInputField();
      if (!inputField) return;

      if (enrichInputIfNeeded(inputField)) suppressAndResend(e);
    }, true);
  }

  function enrichInputIfNeeded(inputField) {
    let target = inputField;
    if (inputField.tagName && inputField.tagName.toLowerCase() === 'rich-textarea') {
      target = inputField.querySelector('div[contenteditable="true"]') || inputField;
    }

    let text = (target.innerText || target.textContent || '').trim();
    // 'Format response strictly' / 'Format output strictly' הם הטקסט שההעשרה עצמה
    // מוסיפה. בלי לבדוק אותם ההעשרה נערמת שוב בכל ניסיון שליחה חוזר.
    if (!text || text.includes('[GemMCP') || text.includes('[OmniMCP') || text.includes('[MCP_RESPONSE') ||
        text.includes('[SCHEMA') || text.includes('[הנחיה') ||
        text.includes('Format response strictly') || text.includes('Format output strictly')) {
      return false;
    }

    // בדיקה אם יש תיוג @כלי (לדוגמה @Supabase, @Notion, @Windows, @GitHub, @Fetch או @Custom)
    const availableTools = getAvailableMentionTools();
    for (const tool of availableTools) {
      // יצירת תבנית שתתאים ל-@ToolTag או @ToolName או @ToolId (למשל @Supabase, @Windows וכו')
      const tagClean = (tool.tag || tool.id || '').replace(/\s+/g, '_');
      const nameClean = (tool.name || '').replace(/\s+/g, '_');
      const candidates = [
        `@${tagClean}`,
        `@${tool.tag || ''}`,
        `@${nameClean}`,
        `@${tool.name || ''}`,
        `@${tool.id}`
      ].filter(c => c && c.length > 1);

      let matchedTag = null;
      for (const cand of candidates) {
        if (text.toLowerCase().includes(cand.toLowerCase())) {
          matchedTag = cand;
          break;
        }
      }

      if (matchedTag) {
        // המשתמש בחר כלי במפורש - מפעילים את השיחה אוטומטית
        markChatActivated();

        // הסרת התגית מהטקסט של המשתמש בצורה בלתי תלויה ברישיות
        const tagRegex = new RegExp(matchedTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let userCleanText = text.replace(tagRegex, '').trim();

        let fullText = '';
        if (typeof generateSingleToolPrompt === 'function') {
          fullText = generateSingleToolPrompt(tool.id, tool.customConfig, customToolPrompts, userCleanText);
        } else {
          fullText = `${userCleanText}\n\n\n\nFormat output strictly as JSON object with service "${tool.id}".`;
        }

        setComposerText(target, fullText);
        addLog(`הוזרק פרומפט ממוקד עבור כלי [${tool.name}] בעת השליחה`);
        return true;
      }
    }

    // אם אין תיוג @כלי והשיחה אינה מופעלת
    if (requireActivation && !isChatActivated()) return false;

    return false;
  }

  // =========================================================================
  // 🌟 מנגנון תפריט @mentions חכם לבחירת כלי והזרקת פרומפט ממוקד
  // =========================================================================

  let mentionPopupEl = null;
  let mentionSelectedIndex = 0;
  let mentionItems = [];
  let isMentionOpen = false;
  let mentionQuery = '';
  let customServersList = [];

  // טעינת רשימת ה-Custom Servers
  chrome.storage.sync.get(['customServers'], (res) => {
    if (Array.isArray(res.customServers)) {
      customServersList = res.customServers;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.customServers) {
      customServersList = changes.customServers.newValue || [];
    }
  });

  function getAvailableMentionTools() {
    const list = [];
    const ICONS = {
      supabase: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.362 9.354H12V.304a.796.796 0 0 0-1.396-.534L1.879 11.238a1.59 1.59 0 0 0 1.097 2.656h9.362v9.05a.796.796 0 0 0 1.396.534l8.725-11.468a1.59 1.59 0 0 0-1.097-2.656z" fill="#3ECF8E"/></svg>`,
      notion: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.373L18.423 2.15c-.466-.467-1.12-.934-2.334-.84L2.872 2.384c-.373.047-.466.327-.326.56l1.913 1.264zm.933 3.36v13.533c0 .84.42 1.12 1.306 1.073l14.15-.84c.886-.046 1.12-.513 1.12-1.353V6.775c0-.607-.233-.887-.793-.84l-14.99.886c-.56.047-.793.327-.793.747zm13.12 1.493c.093.42 0 .84-.42.887l-.746.14v8.307c0 .653-.28 1.026-.98 1.073-.653.047-1.213-.14-1.633-.7l-4.713-7.467v7.047l1.4.28c.094.42-.186.793-.606.84l-3.92.233c-.093-.42.093-.84.513-.886l.933-.187V9.754l-1.306-.14c-.094-.42.186-.793.606-.84l3.92-.234 4.853 7.514V9.38l-1.12-.233c-.094-.42.186-.793.606-.84l3.08-.187c-.046.327 0 .653.046.934z"/></svg>`,
      windows: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="1.5" y="1.5" width="9.5" height="9.5" rx="0.5" fill="#0078D4"/><rect x="13" y="1.5" width="9.5" height="9.5" rx="0.5" fill="#0078D4"/><rect x="1.5" y="13" width="9.5" height="9.5" rx="0.5" fill="#0078D4"/><rect x="13" y="13" width="9.5" height="9.5" rx="0.5" fill="#0078D4"/></svg>`,
      github: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
      fetch: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      custom: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 8v6M2 12h6m8 0h6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"/></svg>`
    };

    const meta = {
      supabase: { id: 'supabase', tag: 'Supabase', name: 'Supabase Database', desc: 'שאילתות SQL ונתונים', icon: ICONS.supabase },
      notion: { id: 'notion', tag: 'Notion', name: 'Notion Workspace', desc: 'חיפוש, פתקים ומשימות', icon: ICONS.notion },
      windows: { id: 'windows', tag: 'Windows', name: 'Windows OS Tools', desc: 'שליטה במחשב, אפליקציות וקבצים', icon: ICONS.windows },
      github: { id: 'github', tag: 'GitHub', name: 'GitHub Integration', desc: 'מאגרים, קוד מקור ו-Issues', icon: ICONS.github },
      fetch: { id: 'fetch', tag: 'Fetch', name: 'Web Fetch & Scraper', desc: 'סריקת אתרים ציבוריים ואישיים מחוברים', icon: ICONS.fetch }
    };

    // הוספת שירותים פעילים ומחוברים
    activeServices.forEach((srvId) => {
      if (srvId !== 'custom' && meta[srvId]) {
        list.push(meta[srvId]);
      }
    });

    // הוספת Custom MCP Servers
    if (Array.isArray(customServersList)) {
      customServersList.filter(s => s.enabled !== false && s.url).forEach((cs, idx) => {
        const srvId = cs.id || `custom_${idx + 1}`;
        const tagName = (cs.name ? cs.name.replace(/\s+/g, '_') : `Custom_${idx + 1}`);
        list.push({
          id: srvId,
          tag: tagName,
          name: cs.name ? cs.name : `Custom MCP #${idx + 1}`,
          desc: cs.customPrompt ? cs.customPrompt.slice(0, 45) + '...' : 'שרת MCP מותאם אישית',
          icon: ICONS.custom,
          isCustom: true,
          customConfig: cs
        });
      });
    }

    return list;
  }

  function initMentionPopup() {
    if (document.getElementById('omni-mcp-mention-popup')) return;

    mentionPopupEl = document.createElement('div');
    mentionPopupEl.id = 'omni-mcp-mention-popup';
    mentionPopupEl.style.display = 'none';
    document.body.appendChild(mentionPopupEl);

    // סגירה בלחיצה מחוץ לתפריט
    document.addEventListener('click', (e) => {
      if (isMentionOpen && mentionPopupEl && !mentionPopupEl.contains(e.target)) {
        hideMentionPopup();
      }
    });
  }

  function showMentionPopup(inputElem, query = '') {
    if (!mentionPopupEl) initMentionPopup();

    mentionQuery = query.toLowerCase().trim();
    const allTools = getAvailableMentionTools();

    // סינון לפי חיפוש
    mentionItems = allTools.filter(item => {
      if (!mentionQuery) return true;
      return item.name.toLowerCase().includes(mentionQuery) ||
             item.id.toLowerCase().includes(mentionQuery) ||
             (item.tag && item.tag.toLowerCase().includes(mentionQuery)) ||
             item.desc.toLowerCase().includes(mentionQuery);
    });

    if (mentionItems.length === 0) {
      hideMentionPopup();
      return;
    }

    if (mentionSelectedIndex >= mentionItems.length) {
      mentionSelectedIndex = 0;
    }

    renderMentionItems();

    // חישוב מיקום מעל או צמוד לתיבת הקלט
    const rect = inputElem.getBoundingClientRect();
    const popupWidth = 320;
    const popupHeight = Math.min(mentionItems.length * 52 + 40, 280);

    let left = rect.right - popupWidth;
    if (left < 10) left = 10;
    let top = rect.top - popupHeight - 12;
    if (top < 10) {
      top = rect.bottom + 10; // אם אין מקום למעלה, מציג מתחת
    }

    mentionPopupEl.style.left = `${left + window.scrollX}px`;
    mentionPopupEl.style.top = `${top + window.scrollY}px`;
    mentionPopupEl.style.display = 'flex';
    isMentionOpen = true;
  }

  function hideMentionPopup() {
    if (mentionPopupEl) {
      mentionPopupEl.style.display = 'none';
    }
    isMentionOpen = false;
    mentionSelectedIndex = 0;
  }

  function renderMentionItems() {
    if (!mentionPopupEl) return;

    let html = `
      <div class="omni-mention-header">
        <span>חיבורי MCP זמינים (@)</span>
        <span style="font-size:10px; opacity:0.8;">Enter לבחירה • Esc לסגירה</span>
      </div>
    `;

    mentionItems.forEach((item, index) => {
      const isSelected = index === mentionSelectedIndex;
      html += `
        <div class="omni-mention-item ${isSelected ? 'selected' : ''}" data-index="${index}">
          <div class="omni-mention-icon">${item.icon || '🔌'}</div>
          <div class="omni-mention-info">
            <div class="omni-mention-title">${escapeHtml(item.name)} <span style="font-size:11px; opacity:0.75; font-weight:normal;">@${item.tag || item.id}</span></div>
            <div class="omni-mention-desc">${escapeHtml(item.desc)}</div>
          </div>
          <span class="omni-mention-badge">${item.isCustom ? 'Custom' : 'MCP'}</span>
        </div>
      `;
    });

    mentionPopupEl.innerHTML = html;

    // האזנה ללחיצות עכבר על פריטים
    mentionPopupEl.querySelectorAll('.omni-mention-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(el.getAttribute('data-index'), 10);
        selectMentionItem(idx);
      });
    });
  }

  function selectMentionItem(index) {
    if (!mentionItems[index]) return;
    const selected = mentionItems[index];
    const inputField = findGeminiInputField();
    if (!inputField) return;

    let target = inputField;
    if (inputField.tagName && inputField.tagName.toLowerCase() === 'rich-textarea') {
      target = inputField.querySelector('div[contenteditable="true"]') || inputField;
    }

    // הדבקת התגית הנקייה בלבד למשל "@Supabase "
    const insertTag = `@${selected.tag || selected.id} `;

    // החלפת תו ה-@ (ומה שנכתב אחריו) בתגית הכלי
    let currentText = target.innerText || target.textContent || '';
    const atIndex = currentText.lastIndexOf('@');
    if (atIndex !== -1) {
      currentText = currentText.substring(0, atIndex) + insertTag;
    } else {
      currentText = insertTag + currentText;
    }

    hideMentionPopup();

    // הזנה לתוך תיבת הטקסט דרך אותו מסלול מסונכרן
    setComposerText(target, currentText);

    // החזרת פוקוס והצבת הסמן בסוף
    target.focus();
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      console.warn('[GemMCP] Error moving caret:', e);
    }

    addLog(`נבחר כלי [${selected.name}] (הוצמדה תגית @${selected.tag || selected.id})`);
  }

  function attachMentionListeners() {
    document.addEventListener('input', (e) => {
      const inputField = findGeminiInputField();
      if (!inputField) return;

      let target = inputField;
      if (inputField.tagName && inputField.tagName.toLowerCase() === 'rich-textarea') {
        target = inputField.querySelector('div[contenteditable="true"]') || inputField;
      }

      if (e.target === target || target.contains(e.target)) {
        const text = target.innerText || target.textContent || '';
        const lastAtIndex = text.lastIndexOf('@');

        if (lastAtIndex !== -1) {
          const afterAt = text.substring(lastAtIndex + 1);
          // אם אין רווח או שורה חדשה אחרי ה-@ (המשתמש כותב שאילתת חיפוש)
          if (!afterAt.includes(' ') && !afterAt.includes('\n') && afterAt.length <= 20) {
            showMentionPopup(target, afterAt);
            return;
          }
        }
        hideMentionPopup();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (!isMentionOpen || !mentionPopupEl) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionItems.length;
        renderMentionItems();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        mentionSelectedIndex = (mentionSelectedIndex - 1 + mentionItems.length) % mentionItems.length;
        renderMentionItems();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        selectMentionItem(mentionSelectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideMentionPopup();
      }
    }, true);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 🌟 הצגת הסבר מוקפץ בפעם הראשונה על אפשרות התיוג ב-@
  function showOnboardingMentionHintIfNeeded() {
    chrome.storage.local.get(['hasSeenMentionHint'], (res) => {
      if (res && res.hasSeenMentionHint) return;

      // בדיקה שאין כבר באנר קיים
      if (document.getElementById('omni-mention-onboarding-hint')) return;

      const hintEl = document.createElement('div');
      hintEl.id = 'omni-mention-onboarding-hint';
      hintEl.className = 'omni-mention-onboarding-hint';
      hintEl.innerHTML = `
        <div class="omni-hint-header">
          <div class="omni-hint-title-group">
            <span class="omni-hint-icon">💡</span>
            <span class="omni-hint-title">טיפ מהיר: תיוג כלים ב-@</span>
          </div>
          <button class="omni-hint-close" id="omni-hint-close-btn" title="סגור">✕</button>
        </div>
        <div class="omni-hint-body">
          בכל פעם שאתה רוצה לכוון את ג'מיני לכלי ספציפי, או כאשר ג'מיני לא מבין ומחזיר טקסט רגיל במקום להריץ כלי – פשוט הקלד <span class="omni-hint-code">@</span> בתיבת הצ'אט ובחר את הכלי המבוקש (למשל <strong>@Windows</strong>, <strong>@Supabase</strong>, <strong>@GitHub</strong>).
        </div>
        <div class="omni-hint-footer">
          <button class="omni-hint-btn" id="omni-hint-gotit-btn">הבנתי, תודה!</button>
        </div>
      `;

      document.body.appendChild(hintEl);

      const dismiss = () => {
        hintEl.style.opacity = '0';
        hintEl.style.transform = 'translateY(16px) scale(0.95)';
        chrome.storage.local.set({ hasSeenMentionHint: true });
        setTimeout(() => {
          if (hintEl.parentNode) hintEl.remove();
        }, 300);
      };

      const closeBtn = document.getElementById('omni-hint-close-btn');
      const gotItBtn = document.getElementById('omni-hint-gotit-btn');
      if (closeBtn) closeBtn.addEventListener('click', dismiss);
      if (gotItBtn) gotItBtn.addEventListener('click', dismiss);

      // הסרה אוטומטית שקטה לאחר 18 שניות אם לא נסגר
      setTimeout(() => {
        if (document.getElementById('omni-mention-onboarding-hint')) {
          dismiss();
        }
      }, 18000);
    });
  }

  // האזנה להודעות מהרקע (למשל הפעלת שרת ה-Bridge בעת שימוש בכלי Windows)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // הפעלת הגשר נמדדה בשמונה עד שתים עשרה שניות. בלי שורת היומן הזו זה
    // נראה כמו תקיעה, וזו הסיבה שנדמה היה שההפעלה האוטומטית לא עובדת.
    if (message && message.type === 'BRIDGE_STARTING') {
      addLog('מעיר את שרת הגשר... זה לוקח כעשר שניות');
      return;
    }

    if (message && message.action === 'TRIGGER_BRIDGE_STARTUP') {
      triggerBridgeStartupProtocol();
      sendResponse({ status: 'triggered' });
    }
  });

  
  function initExtension() {
    console.log(`%c[GemMCP] 🚀 GemMCP Hub פעיל ומוכן על ${SITE.name}!`, 'color: #3b82f6; font-weight: bold; font-size: 14px;');
    createFloatingUI();
    observeGeminiResponses();
    attachUserIntentInterceptor();
    initMentionPopup();
    attachMentionListeners();
    setTimeout(showOnboardingMentionHintIfNeeded, 1200);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initExtension();
  } else {
    window.addEventListener('load', initExtension);
  }
})();


