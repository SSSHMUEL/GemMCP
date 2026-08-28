/**
 * GemMCP Popup Script
 * תמיכה בהתחברות מהירה (OAuth / 1-Click Connect) + הזנה ידנית למתקדמים
 */

document.addEventListener('DOMContentLoaded', () => {
  // i18n Initializer & Language Toggle Button
  const langToggleBtn = document.getElementById('langToggleBtn');
  let currentLang = (typeof detectSystemLanguage === 'function') ? detectSystemLanguage() : 'he';

  function applyLanguage(lang) {
    currentLang = lang;
    window.__gemmcp_current_lang = lang;
    const isRtl = lang === 'he';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');

    if (langToggleBtn) {
      langToggleBtn.textContent = isRtl ? 'EN' : 'עב';
      langToggleBtn.title = isRtl ? 'Switch to English / החלף לאנגלית' : 'עבור לעברית / Switch to Hebrew';
    }

    // Apply translations to all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && typeof t === 'function') {
        const translation = t(key, lang);
        if (translation) {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.hasAttribute('placeholder')) {
              el.setAttribute('placeholder', translation);
            }
          } else {
            el.innerHTML = translation;
          }
        }
      }
    });

    // Update dynamic labels
    const lblWindows = document.getElementById('lbl-prompt-windows');
    if (lblWindows) lblWindows.textContent = (typeof t === 'function' ? t('promptLabelPrefix', lang) : 'הנחיות לכלי ') + (lang === 'he' ? 'Windows' : 'Windows');
    const lblFetch = document.getElementById('lbl-prompt-fetch');
    if (lblFetch) lblFetch.textContent = (typeof t === 'function' ? t('promptLabelPrefix', lang) : 'הנחיות לכלי ') + (lang === 'he' ? 'Web Scraper' : 'Web Scraper');
    const lblSupabase = document.getElementById('lbl-prompt-supabase');
    if (lblSupabase) lblSupabase.textContent = (typeof t === 'function' ? t('promptLabelPrefix', lang) : 'הנחיות לכלי ') + (lang === 'he' ? 'Supabase' : 'Supabase');
    const lblNotion = document.getElementById('lbl-prompt-notion');
    if (lblNotion) lblNotion.textContent = (typeof t === 'function' ? t('promptLabelPrefix', lang) : 'הנחיות לכלי ') + (lang === 'he' ? 'Notion' : 'Notion');
    const lblGithub = document.getElementById('lbl-prompt-github');
    if (lblGithub) lblGithub.textContent = (typeof t === 'function' ? t('promptLabelPrefix', lang) : 'הנחיות לכלי ') + (lang === 'he' ? 'GitHub' : 'GitHub');

    renderCustomServers();
  }

  // Load preferred language or auto-detect
  if (typeof getActiveLanguage === 'function') {
    getActiveLanguage((lang) => {
      applyLanguage(lang);
    });
  } else {
    applyLanguage(currentLang);
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newLang = currentLang === 'he' ? 'en' : 'he';
      if (typeof setActiveLanguage === 'function') {
        setActiveLanguage(newLang, () => {
          applyLanguage(newLang);
        });
      } else {
        applyLanguage(newLang);
      }
    });
  }

  // Inject real version from manifest into footer
  const versionFooter = document.getElementById('version-footer');
  if (versionFooter) {
    versionFooter.textContent = 'v' + chrome.runtime.getManifest().version;
  }


  const serviceCards = document.querySelectorAll('.service-card');

  serviceCards.forEach(card => {
    const header = card.querySelector('.service-header');
    if (header) {
      header.addEventListener('click', (e) => {
        // אל תפתח/תסגור אם הלחיצה הייתה ישירות על מתג ההפעלה
        if (e.target.closest('.switch')) {
          return;
        }
        card.classList.toggle('open');
      });
    }
  });

  // Manual Section Toggles (הצגת/הסתרת שדות הזנה ידניים)
  const manualToggleBtns = document.querySelectorAll('.manual-toggle-btn');
  manualToggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.toggle('open');
        btn.classList.toggle('active');
      }
    });
  });

  // Prompt Textareas for Built-in Services
  const promptTextareas = {
    windows: document.getElementById('prompt-windows'),
    supabase: document.getElementById('prompt-supabase'),
    notion: document.getElementById('prompt-notion'),
    github: document.getElementById('prompt-github'),
    fetch: document.getElementById('prompt-fetch')
  };

  // Track "saved" values for prompt dirty detection
  const promptSavedValues = {};

  // Helper: show/hide the save button for a built-in prompt service
  function updatePromptSaveBtn(srv) {
    const saveBtn = document.querySelector(`.btn-save-prompt[data-service="${srv}"]`);
    if (!saveBtn) return;
    const el = promptTextareas[srv];
    if (!el) return;
    const isDirty = el.value !== (promptSavedValues[srv] ?? el.value);
    saveBtn.style.display = isDirty ? 'inline-block' : 'none';
  }

  // Prompt Toggle Buttons (פתיחה/סגירה של עריכת פרומפט)
  const promptToggleBtns = document.querySelectorAll('.prompt-toggle-btn');
  promptToggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.toggle('open');
        btn.classList.toggle('active');
      }
    });
  });

  // Prompt Save Buttons — appear only when textarea is dirty
  const savePromptBtns = document.querySelectorAll('.btn-save-prompt');
  savePromptBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const srv = btn.dataset.service;
      if (srv && promptTextareas[srv]) {
        promptSavedValues[srv] = promptTextareas[srv].value;
        autoSaveAllSettings();
        btn.style.display = 'none';
        showStatus(typeof t === 'function' ? t('saveBtnSuccess', currentLang) : 'נשמר! ✅', 'success');
      }
    });
  });

  // Reset Prompt Buttons (איפוס לברירת מחדל)
  const resetPromptBtns = document.querySelectorAll('.btn-reset-prompt');
  resetPromptBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const srv = btn.dataset.service;
      if (srv && promptTextareas[srv]) {
        const defPrompt = typeof getDefaultPrompt === 'function' ? getDefaultPrompt(srv, currentLang) : '';
        promptTextareas[srv].value = defPrompt;
        promptSavedValues[srv] = defPrompt;
        updatePromptSaveBtn(srv);
        autoSaveAllSettings();
        showStatus(`הנחיות [${srv}] אופסו לברירת המחדל ↺`, 'success');
      }
    });
  });

  // Services Switches
  const srvSupabase = document.getElementById('srv-supabase');
  const srvNotion = document.getElementById('srv-notion');
  const srvGithub = document.getElementById('srv-github');
  const srvFetch = document.getElementById('srv-fetch');
  const srvWindows = document.getElementById('srv-windows');
  const srvCustom = document.getElementById('srv-custom');

  // Status Pills
  const pillSupabase = document.getElementById('pill-supabase');
  const pillNotion = document.getElementById('pill-notion');
  const pillGithub = document.getElementById('pill-github');
  const pillWindows = document.getElementById('pill-windows');
  const pillCustom = document.getElementById('pill-custom');

  // Input Fields
  const supabaseUrlInput = document.getElementById('supabaseUrl');
  const supabaseKeyInput = document.getElementById('supabaseKey');
  const notionApiKeyInput = document.getElementById('notionApiKey');
  const githubTokenInput = document.getElementById('githubToken');
  const winAllowedPathInput = document.getElementById('winAllowedPath');

  // Custom MCP Container & Button
  const customMcpServersList = document.getElementById('customMcpServersList');
  const addCustomServerBtn = document.getElementById('addCustomServerBtn');
  let customServers = [];

  // Windows Permission Checkboxes
  const winPermRead = document.getElementById('win-perm-read');
  const winPermWrite = document.getElementById('win-perm-write');
  const winPermCommand = document.getElementById('win-perm-command');
  const winPermApp = document.getElementById('win-perm-app');
  const winPermClipboard = document.getElementById('win-perm-clipboard');
  const testWindowsBtn = document.getElementById('testWindowsBtn');
  const stopWindowsBridgeBtn = document.getElementById('stopWindowsBridgeBtn');

  // OAuth & Disconnect Buttons
  const oauthSupabaseBtn = document.getElementById('oauthSupabaseBtn');
  const oauthNotionBtn = document.getElementById('oauthNotionBtn');
  const oauthGithubBtn = document.getElementById('oauthGithubBtn');

  const disconnectSupabaseBtn = document.getElementById('disconnectSupabaseBtn');
  const disconnectNotionBtn = document.getElementById('disconnectNotionBtn');
  const disconnectGithubBtn = document.getElementById('disconnectGithubBtn');

  // Inline Result Elements
  const resSupabase = document.getElementById('result-supabase');
  const resNotion = document.getElementById('result-notion');
  const resGithub = document.getElementById('result-github');
  const resWindows = document.getElementById('result-windows');

  // Action Buttons
  const saveBtn = document.getElementById('saveBtn');
  const testSupabaseBtn = document.getElementById('testSupabaseBtn');
  const testNotionBtn = document.getElementById('testNotionBtn');
  const testGithubBtn = document.getElementById('testGithubBtn');
  const statusMessage = document.getElementById('statusMessage');

  function setInlineResult(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `inline-test-result ${type}`;
    if (type && type !== 'loading') {
      setTimeout(() => {
        el.textContent = '';
        el.className = 'inline-test-result';
      }, 5000);
    }
  }

  function setToggleAvailability(toggleEl, isAvailable) {
    if (!toggleEl) return;
    if (isAvailable) {
      toggleEl.disabled = false;
      toggleEl.closest('.switch').classList.remove('disabled');
      toggleEl.closest('.switch').removeAttribute('title');
    } else {
      toggleEl.checked = false;
      toggleEl.disabled = true;
      toggleEl.closest('.switch').classList.add('disabled');
      toggleEl.closest('.switch').setAttribute('title', 'נדרש לחבר שירות זה תחילה');
    }
  }

  // רינדור רשימת שרתי Custom MCP
  function renderCustomServers() {
    if (!customMcpServersList) return;
    customMcpServersList.innerHTML = '';

    if (customServers.length === 0) {
      customMcpServersList.innerHTML = `
        <div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:12px 6px;background:#fafafa;border:1px dashed var(--border);border-radius:8px;">
          אין כרגע שרתי MCP מותאמים אישית. לחץ על הכפתור למטה כדי להוסיף שרת חדש.
        </div>
      `;
      updateCustomPill();
      return;
    }

    customServers.forEach((server, index) => {
      const item = document.createElement('div');
      item.className = `custom-server-item ${server.enabled === false ? 'disabled' : ''}`;
      item.dataset.id = server.id;

      // Snapshot of saved values for dirty detection
      const savedSnapshot = {
        name: server.name || '',
        url: server.url || '',
        authHeader: server.authHeader || '',
        customPrompt: server.customPrompt || ''
      };

      item.innerHTML = `
        <div class="custom-server-header-row">
          <div class="custom-server-title-meta">
            <span>🔌</span>
            <span class="custom-server-display-name">${escapeHtml(server.name || `שרת MCP מותאם #${index + 1}`)}</span>
          </div>
          <div class="custom-server-controls">
            <label class="switch" title="הפעל/השבת שרת זה" style="transform: scale(0.85);">
              <input type="checkbox" class="custom-server-toggle" ${server.enabled !== false ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn-delete-server" title="מחק שרת">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:15px;height:15px;">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>שם השרת (Name / Alias)</label>
          <input type="text" class="custom-srv-name" placeholder="למשל: Data Analysis Server" value="${escapeHtml(server.name || '')}">
        </div>

        <div class="form-group">
          <label>Server Endpoint URL</label>
          <input type="text" class="custom-srv-url" placeholder="http://localhost:3000/mcp או https://..." dir="ltr" value="${escapeHtml(server.url || '')}">
        </div>

        <div class="form-group">
          <label>קוד חיבור / טוקן אימות (Authorization / API Key)</label>
          <input type="password" class="custom-srv-auth" placeholder="Bearer my-token או סודי..." dir="ltr" value="${escapeHtml(server.authHeader || '')}">
          <div class="input-helper">יועבר ישירות ב-Header (Bearer / API Key) בכל קריאת כלי או בדיקה.</div>
        </div>

        <div class="form-group">
          <label>פרומפט מותאם אישית והנחיות ל-Gemini (Custom Prompt / Intent)</label>
          <textarea class="custom-prompt-textarea custom-srv-prompt" placeholder="לדוגמה: כל בקשה בנושא ניתוח טבלאות נתונים או ייצוא דוחות יש להפנות לשרת זה...">${escapeHtml(server.customPrompt || '')}</textarea>
          <div class="input-helper">הוראות ספציפיות אלו יוזרקו ישירות להנחיות המערכת של Gemini.</div>
        </div>

        <div class="custom-server-actions">
          <div class="custom-server-btn-group">
            <button type="button" class="custom-server-test-btn">⚡ בדוק חיבור לשרת</button>
            <button type="button" class="custom-server-save-btn" style="display:none;">💾 שמור שינויים</button>
          </div>
          <div class="inline-test-result custom-srv-result"></div>
        </div>
      `;

      // Event listeners for this server item
      const toggle = item.querySelector('.custom-server-toggle');
      const nameInput = item.querySelector('.custom-srv-name');
      const urlInput = item.querySelector('.custom-srv-url');
      const authInput = item.querySelector('.custom-srv-auth');
      const promptInput = item.querySelector('.custom-srv-prompt');
      const deleteBtn = item.querySelector('.btn-delete-server');
      const testBtn = item.querySelector('.custom-server-test-btn');
      const customSaveBtn = item.querySelector('.custom-server-save-btn');
      const resultEl = item.querySelector('.custom-srv-result');
      const displayName = item.querySelector('.custom-server-display-name');

      // Helper: check if any field is dirty vs. saved snapshot
      function checkCustomDirty() {
        const dirty =
          nameInput.value.trim() !== savedSnapshot.name ||
          urlInput.value.trim() !== savedSnapshot.url ||
          authInput.value.trim() !== savedSnapshot.authHeader ||
          promptInput.value.trim() !== savedSnapshot.customPrompt;
        if (customSaveBtn) customSaveBtn.style.display = dirty ? 'inline-block' : 'none';
      }

      toggle.addEventListener('change', () => {
        server.enabled = toggle.checked;
        item.classList.toggle('disabled', !toggle.checked);
        autoSaveAllSettings();
      });

      nameInput.addEventListener('input', () => {
        server.name = nameInput.value.trim();
        displayName.textContent = server.name || `שרת MCP מותאם #${index + 1}`;
        checkCustomDirty();
        debouncedAutoSave();
      });

      urlInput.addEventListener('input', () => {
        server.url = urlInput.value.trim();
        checkCustomDirty();
        debouncedAutoSave();
      });

      authInput.addEventListener('input', () => {
        server.authHeader = authInput.value.trim();
        checkCustomDirty();
        debouncedAutoSave();
      });

      promptInput.addEventListener('input', () => {
        server.customPrompt = promptInput.value.trim();
        checkCustomDirty();
        debouncedAutoSave();
      });

      // Save button — explicit manual save
      if (customSaveBtn) {
        customSaveBtn.addEventListener('click', () => {
          // Update snapshot to current values
          savedSnapshot.name = nameInput.value.trim();
          savedSnapshot.url = urlInput.value.trim();
          savedSnapshot.authHeader = authInput.value.trim();
          savedSnapshot.customPrompt = promptInput.value.trim();
          autoSaveAllSettings();
          customSaveBtn.style.display = 'none';
          showStatus('שרת MCP נשמר בהצלחה! 💾', 'success');
        });
      }

      deleteBtn.addEventListener('click', () => {
        if (confirm(`האם אתה בטוח שברצונך למחוק את השרת "${server.name || `שרת #${index + 1}`}"?`)) {
          customServers = customServers.filter(s => s.id !== server.id);
          renderCustomServers();
          autoSaveAllSettings();
          showStatus('שרת MCP הוסר', 'success');
        }
      });

      testBtn.addEventListener('click', () => {
        setInlineResult(resultEl, 'בודק חיבור...', 'loading');
        chrome.runtime.sendMessage({
          action: 'TEST_SERVICE_CONNECTION',
          service: 'custom',
          config: {
            testCustomServer: {
              url: urlInput.value.trim() || server.url,
              authHeader: authInput.value.trim() || server.authHeader
            }
          }
        }, (res) => {
          if (res && res.success) {
            setInlineResult(resultEl, res.message || 'חיבור תקין וזמין! ⚡', 'success');
          } else {
            setInlineResult(resultEl, res ? res.error : 'השרת לא מגיב', 'error');
          }
        });
      });

      customMcpServersList.appendChild(item);
    });

    updateCustomPill();
  }

  function updateCustomPill() {
    if (!pillCustom) return;
    const activeCount = customServers.filter(s => s.enabled !== false && s.url).length;
    if (activeCount > 0) {
      pillCustom.textContent = `${activeCount} מחוברים ⚡`;
      pillCustom.className = 'auth-pill auth-pill-custom connected';
      setToggleAvailability(srvCustom, true);
    } else {
      pillCustom.textContent = `${customServers.length} מוגדרים`;
      pillCustom.className = 'auth-pill auth-pill-custom';
      setToggleAvailability(srvCustom, customServers.length > 0);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // הוספת שרת MCP חדש
  if (addCustomServerBtn) {
    addCustomServerBtn.addEventListener('click', () => {
      const newServer = {
        id: `custom_${Date.now()}`,
        name: `שרת MCP מותאם #${customServers.length + 1}`,
        url: '',
        authHeader: '',
        customPrompt: '',
        enabled: true
      };
      customServers.push(newServer);
      renderCustomServers();
      autoSaveAllSettings();
      // פתיחת כרטיסיית Custom אם סגורה
      const customCard = document.querySelector('.service-card[data-service="custom"]');
      if (customCard && !customCard.classList.contains('open')) {
        customCard.classList.add('open');
      }
    });
  }

  // ⚡ שמירה אוטומטית מיידית לכל שדה קלט (מתגים, שדות טקסט, סיסמאות ופרומפטים)
  function autoSaveAllSettings() {
    chrome.storage.sync.get(null, (existing) => {
      const activeServices = [];
      if (srvSupabase && srvSupabase.checked) activeServices.push('supabase');
      if (srvNotion && srvNotion.checked) activeServices.push('notion');
      if (srvGithub && srvGithub.checked) activeServices.push('github');
      if (srvFetch && srvFetch.checked) activeServices.push('fetch');
      if (srvWindows && srvWindows.checked) activeServices.push('windows');
      if (srvCustom && srvCustom.checked) activeServices.push('custom');

      let cleanUrl = supabaseUrlInput ? supabaseUrlInput.value.trim() : '';
      if (cleanUrl.includes('supabase.com/dashboard/project/')) {
        const match = cleanUrl.match(/project\/([a-z0-9]+)/);
        if (match && match[1]) {
          cleanUrl = `https://${match[1]}.supabase.co`;
          if (supabaseUrlInput) supabaseUrlInput.value = cleanUrl;
        }
      }

      const winPermissions = {
        readFiles: winPermRead ? winPermRead.checked : true,
        writeFiles: winPermWrite ? winPermWrite.checked : false,
        runCommands: winPermCommand ? winPermCommand.checked : false,
        launchApps: winPermApp ? winPermApp.checked : true,
        clipboard: winPermClipboard ? winPermClipboard.checked : true
      };

      // שרת Custom MCP ראשי ראשון לתאימות אחורה
      const firstActiveCustom = customServers.find(s => s.enabled !== false && s.url) || customServers[0];

      // איסוף פרומפטים מותאמים אישית
      const customToolPrompts = {};
      for (const [srv, el] of Object.entries(promptTextareas)) {
        if (el && typeof el.value === 'string') {
          const val = el.value.trim();
          const def = typeof getDefaultPrompt === 'function' ? getDefaultPrompt(srv).trim() : '';
          // נשמור רק אם שונה מברירת המחדל או שקיים ערך מותאם
          if (val && val !== def) {
            customToolPrompts[srv] = el.value;
          }
        }
      }

      const config = {
        activeServices,
        supabaseUrl: cleanUrl || existing.supabaseUrl || '',
        supabaseKey: (supabaseKeyInput && supabaseKeyInput.value.trim()) || existing.supabaseKey || '',
        notionApiKey: (notionApiKeyInput && notionApiKeyInput.value.trim()) || existing.notionApiKey || '',
        githubToken: (githubTokenInput && githubTokenInput.value.trim()) || existing.githubToken || '',
        customMcpUrl: firstActiveCustom ? firstActiveCustom.url : '',
        customServers: customServers,
        winPermissions: winPermissions,
        winAllowedPath: (winAllowedPathInput && winAllowedPathInput.value.trim()) || '',
        customToolPrompts: customToolPrompts
      };

      chrome.storage.sync.set(config, () => {
        updatePills(config);
      });
    });
  }

  let autoSaveDebounce = null;
  function debouncedAutoSave() {
    clearTimeout(autoSaveDebounce);
    autoSaveDebounce = setTimeout(() => {
      autoSaveAllSettings();
      showStatus('נשמר אוטומטית ✨', 'success');
    }, 500);
  }

  // שמירה מיידית בהדלקה/כיבוי של מתגים והרשאות
  [srvSupabase, srvNotion, srvGithub, srvFetch, srvWindows, srvCustom, winPermRead, winPermWrite, winPermCommand, winPermApp, winPermClipboard].forEach(sw => {
    if (sw) {
      sw.addEventListener('change', () => {
        autoSaveAllSettings();
        if (sw === srvWindows && srvWindows.checked) {
          // הפעלת שרת ה-Bridge ברקע באופן אוטומטי אם אינו פועל
          fetch('http://127.0.0.1:3000/api/health')
            .catch(() => {
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = 'gemmcp://start';
              document.body.appendChild(iframe);
              setTimeout(() => iframe.remove(), 2000);
            });
        }
      });
    }
  });

  // שמירה אוטומטית בעת הקלדה בכל שדה קלט מובנה
  const allInputs = [supabaseUrlInput, supabaseKeyInput, notionApiKeyInput, githubTokenInput, winAllowedPathInput].filter(Boolean);
  allInputs.forEach(inp => {
    inp.addEventListener('input', () => {
      chrome.storage.sync.get(null, (cur) => {
        if (inp === notionApiKeyInput) {
          setToggleAvailability(srvNotion, !!(inp.value.trim() || cur.notionConnected));
        }
        if (inp === githubTokenInput) {
          setToggleAvailability(srvGithub, !!(inp.value.trim() || cur.githubConnected));
        }
        if (inp === supabaseUrlInput || inp === supabaseKeyInput) {
          const hasBoth = !!(supabaseUrlInput && supabaseUrlInput.value.trim() &&
                             supabaseKeyInput && supabaseKeyInput.value.trim());
          setToggleAvailability(srvSupabase, hasBoth || !!cur.supabaseConnected);
        }
      });

      debouncedAutoSave();
    });
  });

  // שמירה אוטומטית ברקע + הצגת כפתור שמור בעת עריכת פרומפטים
  Object.entries(promptTextareas).forEach(([srv, textarea]) => {
    if (textarea) {
      textarea.addEventListener('input', () => {
        updatePromptSaveBtn(srv);
        debouncedAutoSave();
      });
    }
  });

  // טעינה ראשונית של כל ההגדרות מהאחסון
  function loadAllStoredSettings() {
    chrome.storage.sync.get(null, (data) => {
      if (chrome.runtime.lastError || !data) return;

      if (supabaseUrlInput && data.supabaseUrl) supabaseUrlInput.value = data.supabaseUrl;
      if (supabaseKeyInput && data.supabaseKey) supabaseKeyInput.value = data.supabaseKey;
      if (notionApiKeyInput && data.notionApiKey) notionApiKeyInput.value = data.notionApiKey;
      if (githubTokenInput && data.githubToken) githubTokenInput.value = data.githubToken;
      if (winAllowedPathInput && data.winAllowedPath) winAllowedPathInput.value = data.winAllowedPath;

      if (data.winPermissions) {
        if (winPermRead) winPermRead.checked = data.winPermissions.readFiles !== false;
        if (winPermWrite) winPermWrite.checked = !!data.winPermissions.writeFiles;
        if (winPermCommand) winPermCommand.checked = !!data.winPermissions.runCommands;
        if (winPermApp) winPermApp.checked = data.winPermissions.launchApps !== false;
        if (winPermClipboard) winPermClipboard.checked = data.winPermissions.clipboard !== false;
      }

      if (Array.isArray(data.customServers)) {
        customServers = data.customServers;
        renderCustomServers();
      }

      if (Array.isArray(data.activeServices)) {
        if (srvSupabase) srvSupabase.checked = data.activeServices.includes('supabase');
        if (srvNotion) srvNotion.checked = data.activeServices.includes('notion');
        if (srvGithub) srvGithub.checked = data.activeServices.includes('github');
        if (srvFetch) srvFetch.checked = data.activeServices.includes('fetch');
        if (srvWindows) srvWindows.checked = data.activeServices.includes('windows');
        if (srvCustom) srvCustom.checked = data.activeServices.includes('custom');
      }

      // טעינת פרומפטים מותאמים אישית או ברירת מחדל
      const customPrompts = data.customToolPrompts || {};
      for (const [srv, el] of Object.entries(promptTextareas)) {
        if (el) {
          if (customPrompts[srv] && typeof customPrompts[srv] === 'string' && customPrompts[srv].trim()) {
            el.value = customPrompts[srv];
          } else {
            el.value = typeof getDefaultPrompt === 'function' ? getDefaultPrompt(srv) : '';
          }
          // Sync saved baseline so dirty detection starts fresh
          promptSavedValues[srv] = el.value;
          updatePromptSaveBtn(srv);
        }
      }

      updatePills(data);
    });
  }

  loadAllStoredSettings();

  // --- כפתור שמור גיבוי גלובלי (נשאר ב-DOM לגיבוי, מוסתר כברירת מחדל) ---
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      autoSaveAllSettings();
      // Update all prompt snapshots
      Object.entries(promptTextareas).forEach(([srv, el]) => {
        if (el) promptSavedValues[srv] = el.value;
        updatePromptSaveBtn(srv);
      });
      showStatus('כל ההגדרות והשרתים נשמרו בהצלחה! 🌟', 'success');
    });
  }

  // --- פונקציית עדכון תגיות סטטוס וכפתורי חיבור/התנתקות ---
  function updatePills(data = {}) {
    // Supabase
    const isSupabaseConnected = !!(data.supabaseConnected || (data.supabaseUrl && data.supabaseKey) || (supabaseUrlInput && supabaseUrlInput.value.trim() && supabaseKeyInput && supabaseKeyInput.value.trim()));
    if (pillSupabase) {
      if (isSupabaseConnected) {
        pillSupabase.textContent = data.supabaseProjectName || 'מחובר ⚡';
        pillSupabase.className = 'auth-pill auth-pill-supabase connected';
        if (oauthSupabaseBtn) oauthSupabaseBtn.style.display = 'none';
        const row = document.getElementById('connected-row-supabase');
        if (row) row.style.display = 'flex';
        setToggleAvailability(srvSupabase, true);
      } else {
        pillSupabase.textContent = 'מנותק';
        pillSupabase.className = 'auth-pill auth-pill-supabase';
        if (oauthSupabaseBtn) oauthSupabaseBtn.style.display = 'flex';
        const row = document.getElementById('connected-row-supabase');
        if (row) row.style.display = 'none';
        setToggleAvailability(srvSupabase, false);
      }
    }

    // Notion
    const isNotionConnected = !!(data.notionConnected || data.notionApiKey || (notionApiKeyInput && notionApiKeyInput.value.trim()));
    if (pillNotion) {
      if (isNotionConnected) {
        pillNotion.textContent = data.notionWorkspaceName || 'מחובר';
        pillNotion.className = 'auth-pill auth-pill-notion connected';
        if (oauthNotionBtn) oauthNotionBtn.style.display = 'none';
        const row = document.getElementById('connected-row-notion');
        if (row) row.style.display = 'flex';
        setToggleAvailability(srvNotion, true);
      } else {
        pillNotion.textContent = 'מנותק';
        pillNotion.className = 'auth-pill auth-pill-notion';
        if (oauthNotionBtn) oauthNotionBtn.style.display = 'flex';
        const row = document.getElementById('connected-row-notion');
        if (row) row.style.display = 'none';
        setToggleAvailability(srvNotion, false);
      }
    }

    // GitHub
    const isGithubConnected = !!(data.githubConnected || data.githubToken || (githubTokenInput && githubTokenInput.value.trim()));
    if (pillGithub) {
      if (isGithubConnected) {
        pillGithub.textContent = data.githubUsername ? `@${data.githubUsername}` : 'מחובר';
        pillGithub.className = 'auth-pill auth-pill-github connected';
        if (oauthGithubBtn) oauthGithubBtn.style.display = 'none';
        const row = document.getElementById('connected-row-github');
        if (row) row.style.display = 'flex';
        setToggleAvailability(srvGithub, true);
      } else {
        pillGithub.textContent = 'מנותק';
        pillGithub.className = 'auth-pill auth-pill-github';
        if (oauthGithubBtn) oauthGithubBtn.style.display = 'flex';
        const row = document.getElementById('connected-row-github');
        if (row) row.style.display = 'none';
        setToggleAvailability(srvGithub, false);
      }
    }

    updateCustomPill();
    checkWindowsBridgeStatus();
  }

  // --- בדיקת סטטוס חי עבור Windows Bridge + Node.js ---
  let popupLaunchFailed = false;

  function checkWindowsBridgeStatus(callback) {
    chrome.runtime.sendMessage({ action: 'TEST_SERVICE_CONNECTION', service: 'windows' }, (res) => {
      const offlineBar = document.getElementById('win-bridge-offline-bar');
      const missingNodeBox = document.getElementById('win-bridge-node-missing-box');
      const stopBridgeBtn = document.getElementById('stopWindowsBridgeBtn');
      
      if (res && res.success) {
        popupLaunchFailed = false;
        if (pillWindows) {
          pillWindows.textContent = 'מחובר ⚡';
          pillWindows.className = 'auth-pill auth-pill-windows connected';
        }
        if (offlineBar) offlineBar.style.display = 'none';
        if (missingNodeBox) missingNodeBox.style.display = 'none';
        if (stopBridgeBtn) stopBridgeBtn.style.display = 'inline-flex';
        if (callback) callback(true);
      } else {
        if (pillWindows) {
          pillWindows.textContent = popupLaunchFailed ? 'ההפעלה נכשלה 🔴' : 'כבוי 🔴';
          pillWindows.className = 'auth-pill auth-pill-windows disconnected';
        }
        if (popupLaunchFailed) {
          if (offlineBar) offlineBar.style.display = 'none';
          if (missingNodeBox) missingNodeBox.style.display = 'block';
        } else {
          if (offlineBar) offlineBar.style.display = 'flex';
          if (missingNodeBox) missingNodeBox.style.display = 'none';
        }
        if (stopBridgeBtn) stopBridgeBtn.style.display = 'none';
        if (callback) callback(false);
      }
    });
  }

  function triggerBridgeStartFromPopup(buttonEl) {
    if (buttonEl) buttonEl.innerHTML = '<span>⏳</span> <span>מפעיל...</span>';
    popupLaunchFailed = false;
    const offlineBar = document.getElementById('win-bridge-offline-bar');
    const missingNodeBox = document.getElementById('win-bridge-node-missing-box');
    if (missingNodeBox) missingNodeBox.style.display = 'none';

    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'gemmcp://start';
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 2000);
    } catch (err) {}

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      checkWindowsBridgeStatus((ok) => {
        if (ok || attempts >= 6) {
          clearInterval(poll);
          if (buttonEl) {
            buttonEl.innerHTML = buttonEl.id === 'btn-retry-start-bridge' ? '<span>🔄</span> <span>נסה שוב</span>' : '<span>⚡</span> <span>הפעל שרת</span>';
          }
          if (!ok) {
            popupLaunchFailed = true;
            checkWindowsBridgeStatus();
          }
        }
      });
    }, 1000);
  }

  const quickStartBridgeBtn = document.getElementById('btn-quick-start-bridge');
  if (quickStartBridgeBtn) {
    quickStartBridgeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerBridgeStartFromPopup(quickStartBridgeBtn);
    });
  }

  const retryStartBridgeBtn = document.getElementById('btn-retry-start-bridge');
  if (retryStartBridgeBtn) {
    retryStartBridgeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerBridgeStartFromPopup(retryStartBridgeBtn);
    });
  }

  // --- OAuth Connect Buttons (התחברות בקליק) ---
  if (oauthSupabaseBtn) {
    oauthSupabaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.set({ pendingOAuthService: 'supabase' }, () => {
        const url = 'https://api.supabase.com/v1/oauth/authorize?client_id=f76e03ca-00e4-4c01-931e-10c4082315b1&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&state=supabase';
        chrome.tabs.create({ url });
      });
    });
  }

  if (oauthNotionBtn) {
    oauthNotionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.set({ pendingOAuthService: 'notion' }, () => {
        const url = 'https://api.notion.com/v1/oauth/authorize?client_id=3bcd872b-594c-811c-8b80-0037d2a8c87a&response_type=code&owner=user&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&state=notion';
        chrome.tabs.create({ url });
      });
    });
  }

  if (oauthGithubBtn) {
    oauthGithubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.set({ pendingOAuthService: 'github' }, () => {
        const url = 'https://github.com/login/oauth/authorize?client_id=Ov23liOnkmB3tYpaHe6D&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&scope=repo%2Cread%3Auser%2Cuser%3Aemail&state=github';
        chrome.tabs.create({ url });
      });
    });
  }

  // --- Disconnect Handlers ---
  if (disconnectSupabaseBtn) {
    disconnectSupabaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.remove(['supabaseUrl', 'supabaseKey', 'supabaseConnected', 'supabaseProjectName'], () => {
        if (supabaseUrlInput) supabaseUrlInput.value = '';
        if (supabaseKeyInput) supabaseKeyInput.value = '';
        updatePills({});
        showStatus('התנתקת מ-Supabase בהצלחה', 'success');
      });
    });
  }

  if (disconnectNotionBtn) {
    disconnectNotionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.remove(['notionApiKey', 'notionWorkspaceName', 'notionConnected'], () => {
        if (notionApiKeyInput) notionApiKeyInput.value = '';
        updatePills({});
        showStatus('התנתקת מ-Notion בהצלחה', 'success');
      });
    });
  }

  if (disconnectGithubBtn) {
    disconnectGithubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.sync.remove(['githubToken', 'githubUsername', 'githubConnected'], () => {
        if (githubTokenInput) githubTokenInput.value = '';
        updatePills({});
        showStatus('התנתקת מ-GitHub בהצלחה', 'success');
      });
    });
  }

  // --- בדיקות חיבור עם תוצאה צמודה ---

  // בדיקת Windows MCP Bridge
  if (testWindowsBtn) {
    testWindowsBtn.addEventListener('click', () => {
      setInlineResult(resWindows, 'בודק...', 'loading');
      chrome.runtime.sendMessage({
        action: 'TEST_SERVICE_CONNECTION',
        service: 'windows'
      }, (res) => {
        if (res && res.success) {
          setInlineResult(resWindows, 'מחובר בהצלחה! 🪟', 'success');
          checkWindowsBridgeStatus();
        } else {
          setInlineResult(resWindows, res?.error || 'שרת ה-Bridge כבוי (דרוש Node.js מותקן)', 'error');
          checkWindowsBridgeStatus();
        }
      });
    });
  }

  // כיבוי יזום של Windows MCP Bridge
  if (stopWindowsBridgeBtn) {
    stopWindowsBridgeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const shuttingDownMsg = typeof t === 'function' ? t('winShuttingDown', currentLang) : 'מכבה שרת... ⏳';
      const shutdownSuccessMsg = typeof t === 'function' ? t('winShutdownSuccess', currentLang) : 'שרת ה-Bridge כובה בהצלחה! 🛑';

      setInlineResult(resWindows, shuttingDownMsg, 'loading');
      stopWindowsBridgeBtn.disabled = true;

      chrome.runtime.sendMessage({ action: 'SHUTDOWN_BRIDGE_SERVER' }, () => {
        stopWindowsBridgeBtn.disabled = false;
        setInlineResult(resWindows, shutdownSuccessMsg, 'error');
        checkWindowsBridgeStatus();
      });
    });
  }

  if (testSupabaseBtn) {
    testSupabaseBtn.addEventListener('click', () => {
      setInlineResult(resSupabase, 'בודק...', 'loading');
      chrome.runtime.sendMessage({
        action: 'TEST_SERVICE_CONNECTION',
        service: 'supabase',
        config: {
          supabaseUrl: supabaseUrlInput ? supabaseUrlInput.value.trim() : '',
          supabaseKey: supabaseKeyInput ? supabaseKeyInput.value.trim() : ''
        }
      }, (res) => {
        if (res && res.success) {
          setInlineResult(resSupabase, 'חיבור תקין! 🚀', 'success');
        } else {
          setInlineResult(resSupabase, res ? res.error : 'שגיאת חיבור', 'error');
        }
      });
    });
  }

  // בדיקת Notion
  if (testNotionBtn) {
    testNotionBtn.addEventListener('click', () => {
      setInlineResult(resNotion, 'בודק...', 'loading');
      chrome.storage.sync.get(['notionApiKey'], (data) => {
        const key = (notionApiKeyInput && notionApiKeyInput.value.trim()) ? notionApiKeyInput.value.trim() : (data.notionApiKey || '');
        chrome.runtime.sendMessage({
          action: 'TEST_SERVICE_CONNECTION',
          service: 'notion',
          config: {
            notionApiKey: key
          }
        }, (res) => {
          if (res && res.success) {
            setInlineResult(resNotion, res.message || 'חיבור תקין! ✅', 'success');
          } else {
            setInlineResult(resNotion, res ? res.error : 'שגיאת חיבור ל-Notion', 'error');
          }
        });
      });
    });
  }

  if (testGithubBtn) {
    testGithubBtn.addEventListener('click', () => {
      setInlineResult(resGithub, 'בודק...', 'loading');
      chrome.runtime.sendMessage({
        action: 'TEST_SERVICE_CONNECTION',
        service: 'github',
        config: {
          githubToken: githubTokenInput ? githubTokenInput.value.trim() : ''
        }
      }, (res) => {
        if (res && res.success) {
          setInlineResult(resGithub, res.message || 'חיבור תקין! ✓', 'success');
        } else {
          setInlineResult(resGithub, res ? res.error : 'שגיאת חיבור ל-GitHub', 'error');
        }
      });
    });
  }

  // ---------- Help Modal Logic ----------
  const helpModalOpenBtn = document.getElementById('helpModalOpenBtn');
  const helpModalCloseBtn = document.getElementById('helpModalCloseBtn');
  const helpModalGotItBtn = document.getElementById('helpModalGotItBtn');
  const helpModalOverlay = document.getElementById('helpModalOverlay');

  function openHelpModal() {
    if (helpModalOverlay) {
      helpModalOverlay.classList.add('open');
    }
  }

  function closeHelpModal() {
    if (helpModalOverlay) {
      helpModalOverlay.classList.remove('open');
    }
  }

  if (helpModalOpenBtn) {
    helpModalOpenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openHelpModal();
    });
  }

  if (helpModalCloseBtn) {
    helpModalCloseBtn.addEventListener('click', () => closeHelpModal());
  }

  if (helpModalGotItBtn) {
    helpModalGotItBtn.addEventListener('click', () => closeHelpModal());
  }

  if (helpModalOverlay) {
    helpModalOverlay.addEventListener('click', (e) => {
      if (e.target === helpModalOverlay) {
        closeHelpModal();
      }
    });
  }

  // ---------- Update & Version Check Logic ----------
  const checkForUpdateBtn = document.getElementById('checkForUpdateBtn');
  if (checkForUpdateBtn) {
    checkForUpdateBtn.addEventListener('click', async () => {
      checkForUpdateBtn.classList.add('spinning');
      showStatus(t('updateChecking', currentLang), 'info');

      try {
        const response = await fetch('https://api.github.com/repos/SSSHMUEL/GemMCP/releases/latest', {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (response.ok) {
          const release = await response.json();
          const latestTag = (release.tag_name || '').replace(/^v/i, '').trim();
          const currentVersion = (chrome.runtime.getManifest().version || '').trim();

          if (latestTag && latestTag !== currentVersion) {
            // בדיקה האם שרת ה-Bridge פעיל כדי להציע עדכון אוטומטי
            chrome.runtime.sendMessage({ action: 'TEST_SERVICE_CONNECTION', service: 'windows' }, (bridgeRes) => {
              const isBridgeOnline = bridgeRes && bridgeRes.success;

              if (isBridgeOnline) {
                const confirmMsg = (t('updateBridgeAutoConfirm', currentLang) || '').replace('{version}', `v${latestTag}`);
                if (confirm(confirmMsg)) {
                  showStatus(t('updateDownloading', currentLang), 'info');
                  checkForUpdateBtn.classList.add('spinning');

                  chrome.runtime.sendMessage({ action: 'TRIGGER_BRIDGE_UPDATE' }, (updateRes) => {
                    checkForUpdateBtn.classList.remove('spinning');
                    if (updateRes && updateRes.success) {
                      showStatus(t('updateSuccessReload', currentLang), 'success');
                      setTimeout(() => {
                        chrome.runtime.reload();
                      }, 1500);
                    } else {
                      showStatus(`${t('updateError', currentLang)}: ${updateRes?.error || 'שגיאה לא ידועה'}`, 'error');
                    }
                  });
                  return;
                }
              } else {
                const hint = `${t('updateAvailable', currentLang)} (v${latestTag})\n\n${t('updateBridgeOffline', currentLang)}\n\n${t('updateOpenGitHub', currentLang)}?`;
                if (confirm(hint)) {
                  window.open(release.html_url || 'https://github.com/SSSHMUEL/GemMCP/releases', '_blank');
                }
              }
            });
          } else {
            showStatus(`${t('updateUpToDate', currentLang)} (v${currentVersion})`, 'success');
          }
        } else {
          const manifestVer = chrome.runtime.getManifest().version;
          showStatus(`${t('updateUpToDate', currentLang)} (v${manifestVer})`, 'success');
        }
      } catch (err) {
        showStatus(`${t('updateError', currentLang)}: ${err.message}`, 'error');
      } finally {
        setTimeout(() => {
          checkForUpdateBtn.classList.remove('spinning');
        }, 600);
      }
    });
  }

  function showStatus(text, type) {
    if (!statusMessage) return;
    statusMessage.textContent = text;
    statusMessage.className = `status-msg ${type}`;
    if (type) {
      setTimeout(() => {
        statusMessage.textContent = '';
      }, 4000);
    }
  }
});
