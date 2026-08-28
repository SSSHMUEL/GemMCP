/**
 * GemMCP - Content Script for Google Gemini Web
 * מנהל את הווידג'ט הצף, זיהוי פקודות רב-שירותיות, והזרקת תוצאות אוטומטית
 */

(function () {
  console.log('%c[GemMCP] 🚀 GemMCP Hub פעיל ומוכן על Gemini!', 'color: #3b82f6; font-weight: bold; font-size: 14px;');

  let isAutoExecute = true;
  let isPaused = false;
  let activeServices = ['supabase', 'fetch'];
  let connectedServices = ['fetch', 'windows'];
  let processedHashes = new Set();
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
  chrome.storage.sync.get(['activeServices', 'autoExecute', 'customServers', 'customToolPrompts', ...CONNECTION_KEYS], (data) => {
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
      isAutoExecute = true;
    }
    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    if (autoToggle) autoToggle.checked = isAutoExecute;
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
    }

    if (!changes.activeServices && !connectionChanged) return;

    chrome.storage.sync.get(['activeServices', ...CONNECTION_KEYS], (data) => {
      connectedServices = computeConnectedServices(data);
      activeServices = (data.activeServices || ['supabase', 'fetch'])
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

          <button class="omni-mcp-action-btn" id="omni-mcp-inject-prompt-btn">
            <svg class="omni-mcp-action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>
            <span>${t('widgetInjectBtn', currentLang)}</span>
          </button>

          <div id="omni-mcp-paused-banner" class="omni-mcp-paused-banner" style="display:none;">
            <span>⏸️ ${currentLang === 'he' ? 'שליחת וקבלת פקודות מושהית (עצירה פעילה)' : 'Command exchange is paused'}</span>
            <button type="button" id="omni-mcp-resume-banner-btn" style="background:#0284c7; color:#fff; border:none; border-radius:4px; padding:2px 8px; font-size:10px; font-weight:700; cursor:pointer;">${t('widgetResumeBtn', currentLang)}</button>
          </div>

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

          <div id="omni-mcp-pending-actions"></div>

          <details class="omni-mcp-logs-details" id="omni-mcp-logs-details">
            <summary class="omni-mcp-logs-summary">
              <span class="omni-mcp-logs-arrow">▾</span>
              <span>${t('widgetLogsTitle', currentLang)}</span>
              <span class="omni-mcp-logs-error-badge" id="omni-mcp-logs-error-badge" hidden>0 ${t('widgetErrorsBadge', currentLang)}</span>
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
    const stopBtn = document.getElementById('omni-mcp-stop-btn');
    const stopBtnText = document.getElementById('omni-mcp-stop-btn-text');
    const stopIcon = document.getElementById('omni-mcp-stop-icon');
    const pausedBanner = document.getElementById('omni-mcp-paused-banner');
    const resumeBannerBtn = document.getElementById('omni-mcp-resume-banner-btn');
    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    const dragHeader = document.getElementById('omni-mcp-drag-header');
    logsContainer = document.getElementById('omni-mcp-logs');

    renderServicesList();
    initWidgetPosition(widgetContainer, toggleBtn, dragHeader, panel);

    function updateStopButtonUI() {
      if (!stopBtn || !stopBtnText || !stopIcon) return;
      if (isPaused) {
        stopBtn.classList.add('paused');
        stopBtn.title = t('widgetResumeTitle', currentLang);
        stopBtnText.textContent = t('widgetResumeBtn', currentLang);
        stopIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>';
        if (pausedBanner) pausedBanner.style.display = 'flex';
      } else {
        stopBtn.classList.remove('paused');
        stopBtn.title = t('widgetStopTitle', currentLang);
        stopBtnText.textContent = t('widgetStopBtn', currentLang);
        stopIcon.innerHTML = '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>';
        if (pausedBanner) pausedBanner.style.display = 'none';
      }
    }

    function toggleStopResume() {
      if (!isPaused) {
        // עצירה מיידית מלאה
        isPaused = true;

        if (activeSendInterval) {
          clearInterval(activeSendInterval);
          activeSendInterval = null;
        }

        if (scanDebounceTimer) {
          clearTimeout(scanDebounceTimer);
          scanDebounceTimer = null;
        }

        isExecuting = false;
        setBadgeBusy(false);

        stopGeminiGeneration();

        const pendingContainer = document.getElementById('omni-mcp-pending-actions');
        if (pendingContainer) pendingContainer.innerHTML = '';

        updateStopButtonUI();
        addLog(t('widgetStoppedLog', currentLang), { error: false });
      } else {
        // חידוש פעילות
        isPaused = false;
        updateStopButtonUI();
        addLog(t('widgetResumedLog', currentLang), { error: false });
      }
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', toggleStopResume);
    }
    if (resumeBannerBtn) {
      resumeBannerBtn.addEventListener('click', toggleStopResume);
    }

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

    autoToggle.addEventListener('change', (e) => {
      isAutoExecute = e.target.checked;
      chrome.storage.sync.set({ autoExecute: isAutoExecute });
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

      panel.classList.toggle('flip-down', top < panelHeight + MARGIN);
      panel.classList.toggle('flip-left', left + btnRect.width < panelWidth + MARGIN);
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

  function addLog(msg, opts) {
    console.log(`%c[GemMCP] ${msg}`, 'color: #10b981; font-weight: bold;');
    if (!logsContainer) return;

    const isError = (opts && typeof opts.error === 'boolean') ? opts.error : isErrorLog(msg);

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
    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('http://127.0.0.1:3000/api/health', { signal: controller.signal });
      clearTimeout(tId);
      if (res.ok) return;
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
    const inputField = findGeminiInputField();
    if (!inputField) {
      alert('לא נמצאה תיבת הקלט של Gemini בדף.');
      return;
    }

    if (isPaused) {
      isPaused = false;
      const stopBtn = document.getElementById('omni-mcp-stop-btn');
      const stopBtnText = document.getElementById('omni-mcp-stop-btn-text');
      const stopIcon = document.getElementById('omni-mcp-stop-icon');
      const pausedBanner = document.getElementById('omni-mcp-paused-banner');
      if (stopBtn && stopBtnText && stopIcon) {
        stopBtn.classList.remove('paused');
        stopBtn.title = t('widgetStopTitle', currentLang);
        stopBtnText.textContent = t('widgetStopBtn', currentLang);
        stopIcon.innerHTML = '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>';
        if (pausedBanner) pausedBanner.style.display = 'none';
      }
    }

    if (activeServices.includes('windows')) {
      ensureWindowsBridgeRunning();
    }

    chrome.storage.sync.get(['customServers', 'customToolPrompts'], (stored) => {
      const toolPrompts = stored.customToolPrompts || customToolPrompts || {};
      const promptText = generateOmniSystemPrompt(activeServices, stored.customServers || [], toolPrompts);
      setInputValueAndSend(inputField, promptText);
      addLog(`הוזרקו הנחיות עבור: ${activeServices.join(', ')}`);
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

  function setInputValueAndSend(element, text) {
    if (!element || isPaused) return;
    let target = element;
    if (element.tagName && element.tagName.toLowerCase() === 'rich-textarea') {
      target = element.querySelector('div[contenteditable="true"]') || element;
    }

    // ניקוי מנגנון שליחה קודם אם היה פעיל
    if (activeSendInterval) {
      clearInterval(activeSendInterval);
      activeSendInterval = null;
    }

    function injectText() {
      if (isPaused) return;
      if (!target || !document.body.contains(target)) {
        const newTarget = findGeminiInputField();
        if (newTarget) {
          target = (newTarget.tagName && newTarget.tagName.toLowerCase() === 'rich-textarea')
            ? (newTarget.querySelector('div[contenteditable="true"]') || newTarget)
            : newTarget;
        }
      }
      if (!target) return;

      target.focus();
      const lines = text.split('\n');
      target.innerHTML = lines.map(line => `<p>${line.trim() === '' ? '<br>' : escapeHtml(line)}</p>`).join('');

      target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // הזרקה ראשונית של התשובה לתיבת הטקסט
    injectText();

    let attempts = 0;
    const maxAttempts = 90; // נבדוק עד כדקה וחצי (90 שניות)
    let hasLoggedWaiting = false;

    function attemptSend() {
      if (isPaused) {
        if (activeSendInterval) {
          clearInterval(activeSendInterval);
          activeSendInterval = null;
        }
        return;
      }
      attempts++;

      // 1. בדיקה אם ג'מיני עדיין מייצר/מזרים את התשובה הנוכחית
      if (isGeminiGenerating()) {
        if (!hasLoggedWaiting) {
          addLog('ממתין לסיום התשובה של Gemini כדי לשלוח תוצאה...');
          hasLoggedWaiting = true;
        }
        return; // ממשיכים להמתין לפעימה הבאה
      }

      // 2. ג'מיני סיים לייצר - מוודאים שהטקסט עדיין נמצא בתיבת הקלט
      const currentTarget = (target && document.body.contains(target)) ? target : findGeminiInputField();
      const actualTarget = (currentTarget && currentTarget.tagName && currentTarget.tagName.toLowerCase() === 'rich-textarea')
        ? (currentTarget.querySelector('div[contenteditable="true"]') || currentTarget)
        : currentTarget;

      if (actualTarget) {
        target = actualTarget;
        const currentText = target.innerText || target.textContent || '';
        if (!currentText.trim() || currentText.trim().length < 5) {
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
        break;
      }

      // 4. אם לא נמצא כפתור או לחיצה ישירה, נבצע סימולציית Enter
      if (!clicked && target) {
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
          console.log('%c[GemMCP] התשובה נשלחה בהצלחה ל-Gemini!', 'color: #10b981; font-weight: bold;');
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

  function observeGeminiResponses() {
    const observer = new MutationObserver(() => {
      // 1. הסתרה מיידית בזמן אמת של תוכן טכני והודעות מענה (בלי שום השהיה)
      scanAndCollapseUserResponses();

      // 2. זיהוי וביצוע הפקודה בסיום ההזרמה
      clearTimeout(scanDebounceTimer);
      scanDebounceTimer = setTimeout(() => {
        scanForToolCalls();
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function isGeminiGenerating() {
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
      'mat-icon[fonticon="stop"]'
    ];
    
    for (const sel of stopSelectors) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        return true;
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
      if (document.querySelector(sel)) return true;
    }

    return false;
  }

  function stopGeminiGeneration() {
    const stopSelectors = [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="עצור"]',
      'button[aria-label*="הפסק"]',
      'button[aria-label*="עצירת"]',
      'button[data-test-id*="stop"]',
      '.stop-button',
      '.stop-btn'
    ];
    for (const sel of stopSelectors) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        el.click();
        return true;
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
    // בדיקה האם יש הודעת משתמש חדשה יותר, תוצאת MCP או תגובת מודל נוספת עוקבת לאחר התשובה הזו
    const currentTurn = el.closest('[data-test-id="conversation-turn"]') || el.closest('model-response') || el.closest('message-content') || el.closest('.model-response-text');
    if (!currentTurn) return false;

    // 1. בדיקת אחים עוקבים ב-DOM
    let nextNode = currentTurn.nextElementSibling;
    while (nextNode) {
      const text = nextNode.innerText || nextNode.textContent || '';
      if (text.includes('[MCP_RESPONSE') || text.includes('[MCP Result]') || text.includes('תוצאת ביצוע') || text.includes('תוצאות [') ||
          nextNode.querySelector('[data-test-id="user-turn"], .user-query, user-message, [data-is-user="true"], user-query-container, model-response, [data-test-id="conversation-turn"]')) {
        return true;
      }
      nextNode = nextNode.nextElementSibling;
    }

    // 2. בדיקה האם יש תור תשובה נוסף של ג'מיני אחרי הפקודה
    const allTurns = Array.from(document.querySelectorAll('[data-test-id="conversation-turn"], model-response'));
    const currIndex = allTurns.indexOf(currentTurn);
    if (currIndex !== -1 && currIndex < allTurns.length - 1) {
      return true;
    }

    return false;
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
    targetEl.dataset.omniWidgetInjected = 'true';

    // מציאת האלמנט העוטף שמציג את הקוד/JSON ב-Gemini
    const codeBlockContainer = targetEl.closest('pre, code-block, .code-block, .formatted-code, .code-container') || targetEl;
    
    // הסתרת בלוק הקוד המקורי
    codeBlockContainer.style.display = 'none';

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

    codeBlockContainer.parentNode.insertBefore(widget, codeBlockContainer.nextSibling);
    return widget;
  }

  function updateToolCardStatus(service, toolCall, isSuccess, errorMsg = '', resultData = null) {
    const widgets = document.querySelectorAll('.gemmcp-tool-pill-container');
    if (!widgets.length) return;

    widgets.forEach((widget) => {
      const statusEl = widget.querySelector('.gemmcp-tool-pill-status');
      if (!statusEl) return;

      if (statusEl.classList.contains('running')) {
        if (isSuccess) {
          statusEl.className = 'gemmcp-tool-pill-status done';
          statusEl.innerHTML = `<span>✓</span><span>הושלם</span>`;
          if (resultData) {
            const details = widget.querySelector('.gemmcp-tool-pill-details');
            if (details) {
              const formattedData = typeof resultData === 'object' ? JSON.stringify(resultData, null, 2) : String(resultData);
              if (!details.innerHTML.includes('gemmcp-section-response')) {
                details.innerHTML += `
                  <div class="gemmcp-section-response" style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.15);">
                    <div style="font-weight:700; color:#34d399; margin-bottom:6px;">📥 תגובה שהתקבלה משרת ה-MCP:</div>
                    <pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${escapeHtml(formattedData)}</pre>
                  </div>
                `;
              }
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
      }
    });
  }

  function scanAndCollapseUserResponses() {
    // 1. הסתרה מלאה ונקייה של הודעות [MCP_RESPONSE:] של המשתמש והצמדת התוצאות לווידג'ט הראשי
    const userNodes = Array.from(document.querySelectorAll('[data-test-id="user-turn"], .user-query, user-message, [data-is-user="true"], user-query-container, .user-query-container'));
    for (const node of userNodes) {
      if (node.dataset.omniResponseHidden === 'true') continue;
      const text = node.innerText || node.textContent || '';
      if (text.includes('[MCP_RESPONSE:')) {
        node.dataset.omniResponseHidden = 'true';
        
        // הסתרה של בועת המשתמש הזמנית
        node.style.display = 'none';

        // הוספת התוצאה לפרטי הווידג'ט המאוחד האחרון
        const allExistingWidgets = document.querySelectorAll('.gemmcp-tool-pill-container');
        if (allExistingWidgets.length > 0) {
          const lastW = allExistingWidgets[allExistingWidgets.length - 1];
          const details = lastW.querySelector('.gemmcp-tool-pill-details');
          if (details && !details.innerHTML.includes('gemmcp-section-response')) {
            details.innerHTML += `
              <div class="gemmcp-section-response" style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.15);">
                <div style="font-weight:700; color:#34d399; margin-bottom:6px;">📥 תגובה שהתקבלה משרת ה-MCP:</div>
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${escapeHtml(text)}</pre>
              </div>
            `;
          }
        }

        // עדכון סטטוס הווידג'טים להושלם
        updateToolCardStatus('', null, true);
      }
    }

    // 2. סריקת כל הווידג'טים שנמצאים ב-DOM: אם יש אחריהם תוכן שיחה, תגובת ג'מיני או שהשיחה המשיכה - הם הושלמו
    const allWidgets = document.querySelectorAll('.gemmcp-tool-pill-container');
    allWidgets.forEach(widget => {
      const statusEl = widget.querySelector('.gemmcp-tool-pill-status');
      if (statusEl && statusEl.classList.contains('running')) {
        const turn = widget.closest('[data-test-id="conversation-turn"]') || widget.closest('model-response') || widget.closest('message-content') || widget.parentElement;
        if (turn) {
          // אם יש תורות שיחה נוספים אחרי הווידג'ט הזה, או שיש הודעת משתמש/מודל עוקבת
          let next = turn.nextElementSibling;
          let isFollowed = false;
          while (next) {
            if (next.textContent && next.textContent.trim().length > 0) {
              isFollowed = true;
              break;
            }
            next = next.nextElementSibling;
          }
          if (isFollowed) {
            statusEl.className = 'gemmcp-tool-pill-status done';
            statusEl.innerHTML = `<span>✓</span><span>הושלם</span>`;
            widget.dataset.gemmcpFinalAnswerReached = 'true';
          }
        }
      }
    });

    // 2. זיהוי והסתרה מיידית בזמן אמת (Instant Stream Hiding) של בלוקי קוד JSON בזמן שהם נוצרים
    const rawBlocks = document.querySelectorAll('pre, code, .code-block, code-block, .formatted-code, .code-container');
    for (const block of rawBlocks) {
      if (block.dataset.omniStreamingHidden === 'true' || block.style.display === 'none') continue;
      const txt = block.innerText || block.textContent || '';
      if (txt.includes('{"service"') || txt.includes('"action"') || (txt.includes('{') && (txt.includes('supabase') || txt.includes('windows') || txt.includes('github') || txt.includes('notion') || txt.includes('fetch') || txt.includes('execute_sql')))) {
        // מסתירים מיד את הבלוק הטכני כדי שהמשתמש לא יראה את הג'יבריש/קוד נשפך
        block.dataset.omniStreamingHidden = 'true';
        block.style.display = 'none';
      }
    }
  }

  function scanForToolCalls(forceRescan = false) {
    if (isPaused || isExecuting) return false;

    // עיבוד והסתרת תגובות משתמש קודמות והסתרת הזרמות קוד בזמן אמת
    scanAndCollapseUserResponses();

    // אם ג'מיני עדיין מקליד באופן פעיל, נמתין לסיום הזרמת הפקודה
    if (!forceRescan && isGeminiGenerating()) {
      clearTimeout(scanDebounceTimer);
      scanDebounceTimer = setTimeout(scanForToolCalls, 150);
      return false;
    }

    if (forceRescan) {
      isInitialGracePeriod = false;
    }

    const codeBlocks = Array.from(document.querySelectorAll('pre, code, .code-block, code-block, .formatted-code, .code-container, message-content, model-response, div.markdown'));
    // בסריקה ידנית נבדוק מהסוף להתחלה כדי למצוא את הפקודה האחרונה ביותר
    const elements = forceRescan ? codeBlocks.reverse() : codeBlocks;
    let foundAndTriggered = false;

    for (const el of elements) {
      if (!forceRescan && (el.dataset.omniProcessed === 'true' || el.closest('[data-omni-processed="true"]'))) {
        continue;
      }

      const text = el.innerText || el.textContent || '';
      
      if (text.includes('{') && (text.includes('"action"') || text.includes('"service"') || text.includes('"app_name"') || text.includes('"command"') || text.includes('"path"') || text.includes('execute_sql') || text.includes('"query"'))) {
        const toolCall = parseToolCall(text);
        if (toolCall) {
          el.dataset.omniProcessed = 'true';
          const parentTurn = el.closest('[data-test-id="conversation-turn"]') || el.closest('model-response') || el.closest('message-content');
          if (parentTurn) parentTurn.dataset.omniProcessed = 'true';

          // הסבה / מיזוג מיידי לווידג'ט מקופל אלגנטי
          const srv = normalizeServiceName(toolCall.service || 'supabase');
          renderCollapsibleToolCard(el, toolCall, srv);

          // אם מדובר בטעינה ראשונית של הדף או שההודעה הזו כבר נענתה בהיסטוריית הצ'אט (ולא נלחץ ריענון ידני)
          if (!forceRescan && (isInitialGracePeriod || isElementAlreadyAnswered(el))) {
            const callKey = `${toolCall.service}_${toolCall.action}_${JSON.stringify(toolCall)}`;
            processedHashes.add(callKey);
            updateToolCardStatus(srv, toolCall, true);
            continue;
          }

          const callKey = `${toolCall.service}_${toolCall.action}_${JSON.stringify(toolCall)}`;
          if (!forceRescan && processedHashes.has(callKey)) continue;
          processedHashes.add(callKey);

          console.log('%c[GemMCP] 🎯 זוהתה פקודת MCP שלמה ותקינה:', 'color: #f59e0b; font-weight: bold;', toolCall);
          handleDetectedToolCall(toolCall);
          foundAndTriggered = true;
          if (forceRescan) break; // בלחיצה ידנית מבצעים רק את הפקודה האחרונה שנמצאה
        }
      }
    }
    return foundAndTriggered;
  }

  function extractFirstJsonObject(str) {
    let openBraces = 0;
    let startIndex = -1;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (char === '"' && !isEscaped) {
        inString = !inString;
      }
      isEscaped = (char === '\\' && !isEscaped);

      if (!inString) {
        if (char === '{') {
          if (openBraces === 0) startIndex = i;
          openBraces++;
        } else if (char === '}') {
          openBraces--;
          if (openBraces === 0 && startIndex !== -1) {
            const candidate = str.substring(startIndex, i + 1);
            try {
              return JSON.parse(candidate);
            } catch (e) {
              // Continue searching if this wasn't valid JSON
              startIndex = -1;
            }
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
    if (isPaused) {
      console.log('[GemMCP] Skipped tool call because GemMCP is paused/stopped');
      return;
    }

    const service = normalizeServiceName(toolCall.service || 'supabase');
    toolCall.service = service;

    // בדיקה האם השירות דלוק ומורשה לפעול
    if (!isServiceActive(service)) {
      console.log(`[GemMCP] ⏸️ פקודה עבור [${service}] נדחתה כי הכלי מכובה בהגדרות.`);
      addLog(`התעלם מפקודה עבור [${service}] – הכלי כבוי בהגדרות`, { error: false });
      return;
    }

    const autoToggle = document.getElementById('omni-mcp-auto-toggle');
    const autoRun = autoToggle ? autoToggle.checked : isAutoExecute;
    addLog(`זוהתה בקשה מ-Gemini עבור [${service}]: ${toolCall.action || toolCall.tool_name || 'execute'}`);

    if (autoRun) {
      executeTool(service, toolCall);
    } else {
      promptUserApproval(service, toolCall);
    }
  }

  function promptUserApproval(service, toolCall) {
    if (isPaused) return;
    const container = document.getElementById('omni-mcp-pending-actions');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'omni-mcp-query-card';
    card.innerHTML = `
      <div class="omni-mcp-query-header">
        <span>בקשת פעולה מג'מיני</span>
        <span style="color:#60a5fa;">[${service}] ${toolCall.action || ''}</span>
      </div>
      <div class="omni-mcp-sql-preview">${escapeHtml(JSON.stringify(toolCall, null, 2))}</div>
      <div class="omni-mcp-btn-group">
        <button class="omni-mcp-btn-approve">אשר והרץ</button>
        <button class="omni-mcp-btn-reject">בטל</button>
      </div>
    `;

    const approveBtn = card.querySelector('.omni-mcp-btn-approve');
    const rejectBtn = card.querySelector('.omni-mcp-btn-reject');

    // סוגר את הפאנל רק אם לא נשארו בקשות אישור נוספות שממתינות
    function closeIfNoPendingCards() {
      if (!container.querySelector('.omni-mcp-query-card')) closePanel();
    }

    approveBtn.addEventListener('click', () => {
      card.remove();
      closeIfNoPendingCards();
      executeTool(service, toolCall);
    });

    rejectBtn.addEventListener('click', () => {
      card.remove();
      sendResponseToGemini(service, { error: "הפעולה בוטלה על ידי המשתמש." });
      addLog('הפעולה בוטלה ע"י המשתמש', { error: false });
      closeIfNoPendingCards();
    });

    container.appendChild(card);
    openPanel();
  }

  function executeTool(service, toolCall) {
    if (isPaused || isExecuting) {
      console.log('[GemMCP] Tool execution skipped (paused or busy)...');
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
      }
    }, 6000);

    addLog(`מבצע שירות [${service}]...`);

    if (!chrome.runtime || !chrome.runtime.id) {
      addLog('התוסף עודכן ברקע. נא לרענן את העמוד (F5).');
      clearTimeout(executionTimeout);
      isExecuting = false;
      setBadgeBusy(false);
      return;
    }

    try {
      chrome.storage.sync.get(null, (config) => {
        if (chrome.runtime.lastError) {
          addLog('נא לרענן את דף Gemini (F5) לסנכרון התוסף');
          clearTimeout(executionTimeout);
          isExecuting = false;
          setBadgeBusy(false);
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
            if (isPaused) {
              console.log('[GemMCP] Execution finished but GemMCP is paused; ignoring response');
              isExecuting = false;
              setBadgeBusy(false);
              return;
            }
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
      updateToolCardStatus(service, toolCall, false, e.message);
      isExecuting = false;
      setBadgeBusy(false);
    }
  }

  function sendResponseToGemini(service, resultData) {
    if (isPaused) return;
    const inputField = findGeminiInputField();
    if (!inputField) return;

    const formattedResponse = `[MCP_RESPONSE: ${service}]\n\`\`\`json\n${JSON.stringify(resultData, null, 2)}\n\`\`\`\nנתח את התוצאות הנ"ל וענה למשתמש בשפה טבעית, מלאה וברורה. אל תחזיר שוב פקודת JSON אלא הצג למשתמש את המידע שהתקבל.`;
    setInputValueAndSend(inputField, formattedResponse);
  }

  function attachUserIntentInterceptor() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const inputField = findGeminiInputField();
        if (inputField && (document.activeElement === inputField || inputField.contains(document.activeElement))) {
          enrichInputIfNeeded(inputField);
        }
      }
    }, true);

    document.addEventListener('click', (e) => {
      const sendBtn = e.target.closest('button.send-button, button[aria-label*="שלח"], button[aria-label*="Send"], .send-button-container button');
      if (sendBtn) {
        const inputField = findGeminiInputField();
        if (inputField) {
          enrichInputIfNeeded(inputField);
        }
      }
    }, true);
  }

  function enrichInputIfNeeded(inputField) {
    if (isPaused) return;
    let target = inputField;
    if (inputField.tagName && inputField.tagName.toLowerCase() === 'rich-textarea') {
      target = inputField.querySelector('div[contenteditable="true"]') || inputField;
    }

    let text = (target.innerText || target.textContent || '').trim();
    if (!text || text.includes('[GemMCP') || text.includes('[OmniMCP') || text.includes('[MCP_RESPONSE') || text.includes('[SCHEMA') || text.includes('[הנחיה')) {
      return;
    }

    const WINDOWS_SCHEMA = `Format response strictly as a JSON object for Windows OS:
- open_app: {"service": "windows", "action": "open_app", "app_name": "<name>"}
- list_directory: {"service": "windows", "action": "list_directory", "path": "<path e.g. ~/Downloads, ~/Desktop, C:\\...>"}
- read_file: {"service": "windows", "action": "read_file", "path": "<path>"}
- write_file: {"service": "windows", "action": "write_file", "path": "<path>", "content": "<text>"}
- run_command: {"service": "windows", "action": "run_command", "command": "<powershell_command>"}
- clipboard_read: {"service": "windows", "action": "clipboard_read"}
- clipboard_write: {"service": "windows", "action": "clipboard_write", "text": "<text>"}`;

    const SUPABASE_SCHEMA = `Format response strictly as a JSON object for Supabase:
- execute_sql: {"service": "supabase", "action": "execute_sql", "query": "<SQL query based on request>"}`;

    const NOTION_SCHEMA = `Format response strictly as a JSON object for Notion:
- search: {"service": "notion", "action": "search", "query": "<search_term or empty>"}
- get_page: {"service": "notion", "action": "get_page", "page_id": "<page_id>"}
- create_page: {"service": "notion", "action": "create_page", "title": "<title>", "content": "<content>"}`;

    const GITHUB_SCHEMA = `Format response strictly as a JSON object for GitHub:
- list_repos: {"service": "github", "action": "list_repos"}
- get_file: {"service": "github", "action": "get_file", "repo": "<owner/repo>", "path": "<path>"}
- create_repo: {"service": "github", "action": "create_repo", "name": "<name>", "private": false}
- create_issue: {"service": "github", "action": "create_issue", "repo": "<repo>", "title": "<title>", "body": "<body>"}`;

    const FETCH_SCHEMA = `Format response strictly as a JSON object for Web Fetch:
- get_url: {"service": "fetch", "action": "get_url", "url": "<url>"}`;

    // 1. בדיקה אם יש תיוג @כלי (לדוגמה @Supabase, @Notion, @Windows, @GitHub, @Fetch או @Custom)
    const availableTools = getAvailableMentionTools();
    for (const tool of availableTools) {
      // יצירת תבנית שתתאים ל-@ToolTag או @ToolName (למשל @Supabase או @Supabase_Database)
      const tagClean = (tool.tag || tool.id || '').replace(/\s+/g, '_');
      const nameClean = (tool.name || '').replace(/\s+/g, '_');
      const atTag = `@${tagClean}`;
      const atName = `@${nameClean}`;
      const atId = `@${tool.id}`;

      if (text.includes(atTag) || text.includes(atName) || text.includes(atId)) {
        // הסרת התגית מהטקסט של המשתמש
        let userCleanText = text
          .replace(atTag, '')
          .replace(atName, '')
          .replace(atId, '')
          .trim();

        let fullText = '';
        if (typeof generateSingleToolPrompt === 'function') {
          fullText = generateSingleToolPrompt(tool.id, tool.customConfig, customToolPrompts, userCleanText);
        } else {
          fullText = `${userCleanText}\n\nFormat output strictly as JSON object with service "${tool.id}".`;
        }

        const lines = fullText.split('\n');
        target.innerHTML = lines.map(line => `<p>${line.trim() === '' ? '<br>' : escapeHtml(line)}</p>`).join('');
        target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: fullText }));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        addLog(`הוזרק פרומפט ממוקד עבור כלי [${tool.name}] בעת השליחה`);
        return;
      }
    }

    const lower = text.toLowerCase();
    let directive = '';

    // זיהוי כוונות Notion
    if (activeServices.includes('notion') && (lower.includes('נושן') || lower.includes('notion') || lower.includes('פתק') || lower.includes('רשימ') || lower.includes('משימ') || lower.includes('דפים'))) {
      directive = `\n\n${NOTION_SCHEMA}`;
    }
    // זיהוי כוונות Supabase
    else if (activeServices.includes('supabase') && (lower.includes('סופה') || lower.includes('supabase') || lower.includes('טבלא') || lower.includes('מסד נתונים') || lower.includes('sql') || lower.includes('בסיס נתונים') || lower.includes('שאילת'))) {
      directive = `\n\n${SUPABASE_SCHEMA}`;
    }
    // זיהוי כוונות Windows
    else if (activeServices.includes('windows') && (
      lower.includes('פתח') || lower.includes('תפתח') || lower.includes('הפעל') || lower.includes('סגור') ||
      lower.includes('הורדות') || lower.includes('שולחן עבודה') || lower.includes('מסמכים') || lower.includes('תיקיי') ||
      lower.includes('קובץ') || lower.includes('סרוק') || lower.includes('קרא') || lower.includes('כתוב') || lower.includes('שמור') ||
      lower.includes('powershell') || lower.includes('cmd') || lower.includes('ווינדוס') || lower.includes('windows') ||
      lower.includes('מחשב') || lower.includes('לוח') || lower.includes('clipboard') || lower.includes('תהליכ') ||
      lower.includes('זיכרון') || lower.includes('מחשבון') || lower.includes('וורד') || lower.includes('אקסל') ||
      lower.includes('vscode') || lower.includes('קלוד') || lower.includes('ספוטיפיי') || lower.includes('כרום')
    )) {
      directive = `\n\n${WINDOWS_SCHEMA}`;
    }
    // זיהוי כוונות GitHub
    else if (activeServices.includes('github') && (lower.includes('גיטהאב') || lower.includes('github') || lower.includes('מאגר') || lower.includes('ריפו') || lower.includes('issue'))) {
      directive = `\n\n${GITHUB_SCHEMA}`;
    }
    // זיהוי כוונות Fetch (קישורים ואתרים)
    else if (activeServices.includes('fetch') && (lower.includes('http://') || lower.includes('https://') || lower.includes('אתר') || lower.includes('סרוק קישור') || lower.includes('קרא אתר'))) {
      directive = `\n\n${FETCH_SCHEMA}`;
    }

    if (directive) {
      const fullText = text.trim() + directive;
      const lines = fullText.split('\n');
      target.innerHTML = lines.map(line => `<p>${line.trim() === '' ? '<br>' : escapeHtml(line)}</p>`).join('');
      target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: fullText }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
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

    // הזנה לתוך תיבת הטקסט
    const lines = currentText.split('\n');
    target.innerHTML = lines.map(line => `<p>${line.trim() === '' ? '<br>' : escapeHtml(line)}</p>`).join('');
    target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: currentText }));
    target.dispatchEvent(new Event('input', { bubbles: true }));

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
    if (message && message.action === 'TRIGGER_BRIDGE_STARTUP') {
      triggerBridgeStartupProtocol();
      sendResponse({ status: 'triggered' });
    }
  });

  // האזנה גלובלית ללחיצות על הווידג'ט לפתיחה/סגירה של פרטי השאילתות והתוצאות
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('.gemmcp-tool-pill');
    if (pill) {
      const container = pill.closest('.gemmcp-tool-pill-container');
      if (container) {
        container.classList.toggle('expanded');
      }
    }
  });

  window.addEventListener('load', () => {
    createFloatingUI();
    observeGeminiResponses();
    attachUserIntentInterceptor();
    initMentionPopup();
    attachMentionListeners();
    setTimeout(showOnboardingMentionHintIfNeeded, 1200);
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    createFloatingUI();
    observeGeminiResponses();
    attachUserIntentInterceptor();
    initMentionPopup();
    attachMentionListeners();
    setTimeout(showOnboardingMentionHintIfNeeded, 1200);
  }
})();

