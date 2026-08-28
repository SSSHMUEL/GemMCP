const params = new URLSearchParams(window.location.search);
const service = params.get('service') || 'השירות';
const name = params.get('name');
const err = params.get('error');

const iconBox = document.getElementById('iconBox');
const brandSvg = document.getElementById('brandSvg');
const serviceTitle = document.getElementById('serviceTitle');
const serviceDesc = document.getElementById('serviceDesc');
const statusBadge = document.getElementById('statusBadge');
const badgeText = document.getElementById('badgeText');
const closeBtn = document.getElementById('closeBtn');
const timerSeconds = document.getElementById('timerSeconds');
const countdownBox = document.getElementById('countdownBox');

function closeThisTab() {
  try {
    chrome.runtime.sendMessage({ action: 'CLOSE_TAB' });
  } catch (e) {}
  window.close();
}

let lang = (typeof detectSystemLanguage === 'function') ? detectSystemLanguage() : 'he';

function applyOAuthTexts(currentLang) {
  const isEn = currentLang === 'en';
  document.documentElement.setAttribute('lang', currentLang);
  document.documentElement.setAttribute('dir', isEn ? 'ltr' : 'rtl');

  const closeBtnText = document.getElementById('closeBtnText');
  if (closeBtnText) closeBtnText.textContent = isEn ? 'Return to Gemini' : 'חזור ל-Gemini';

  const countdownPrefix = document.getElementById('countdownPrefix');
  if (countdownPrefix) countdownPrefix.textContent = isEn ? 'This tab will close automatically in ' : 'חלון זה ייסגר אוטומטית בעוד ';

  const countdownSuffix = document.getElementById('countdownSuffix');
  if (countdownSuffix) countdownSuffix.textContent = isEn ? ' seconds...' : ' שניות...';

  if (err) {
    serviceTitle.textContent = isEn ? '⚠️ Authentication Error' : '⚠️ שגיאה בהתחברות';
    serviceDesc.textContent = err === 'invalid_grant'
      ? (isEn ? 'The authorization code has expired or was already used. Please try connecting again.' : 'קוד האימות של Notion פג תוקף או נוצל כבר. אנא לחץ שוב על כפתור ההתחברות.')
      : err;
    statusBadge.style.background = 'rgba(153, 27, 27, 0.25)';
    statusBadge.style.color = '#fca5a5';
    statusBadge.style.borderColor = 'rgba(220, 38, 38, 0.4)';
    badgeText.textContent = isEn ? 'Authentication Failed' : 'שגיאת אימות';
    const badgeDot = document.getElementById('badgeDot');
    if (badgeDot) badgeDot.style.display = 'none';
    if (countdownBox) countdownBox.style.display = 'none';
  } else {
    badgeText.textContent = isEn ? 'Connected & Active' : 'מחובר ופעיל בהצלחה';
    if (service === 'notion') {
      iconBox.className = 'icon-wrap notion-icon-theme';
      iconBox.innerHTML = `
        <svg class="icon-svg" viewBox="0 0 122 122" fill="none">
          <path class="notion-page" d="M6 12.5 74.5 7.5c8.4-.7 10.6-.2 15.9 3.6l21.9 15.4c3.6 2.6 4.8 3.3 4.8 6.2v83.4c0 5.3-1.9 8.4-8.6 8.9l-79.5 4.8c-5.1.2-7.5-.5-10.2-3.8L4.7 105.9C1.8 102 .6 99.1.6 95.7V21.4C.6 17.1 2.5 13.5 6 12.5Z"/>
          <path class="notion-mark" fill-rule="evenodd" clip-rule="evenodd" d="M74.5 7.5 6 12.5C2.5 13.5.6 17.1.6 21.4v74.3c0 3.4 1.2 6.3 4.1 10.2l14.1 18.3c2.7 3.3 5.1 4 10.2 3.8l79.5-4.8c6.7-.5 8.6-3.6 8.6-8.9V32.7c0-2.7-1.1-3.5-4.3-5.8l-.5-.4-21.9-15.4c-5.3-3.8-7.5-4.3-15.9-3.6ZM31 24.4c-6.5.4-8 .5-11.7-2.5L9.9 14.4c-1-1-.5-2.2.9-2.4l65.9-4.8c5.5-.5 8.4 1.4 10.6 3.1l11.4 8.2c.3.2 1.1 1.2.1 1.2l-68 4.1-.2.1ZM23.4 111V39.3c0-3.1 1-4.6 3.9-4.8l78-4.6c2.7-.2 3.9 1.5 3.9 4.6v71.2c0 3.1-.5 5.8-4.8 6l-74.6 4.3c-4.3.2-6.4-1.2-6.4-5Zm73.7-68c.5 2.2 0 4.3-2.2 4.6l-3.6.7v52.8c-3.1 1.7-6 2.7-8.4 2.7-3.9 0-4.8-1.2-7.7-4.8L51.5 61.9v35.9l7.5 1.7s0 4.3-6 4.3l-16.6 1c-.5-1 0-3.4 1.7-3.9l4.3-1.2V50.5l-6-.5c-.5-2.2.7-5.3 4.1-5.5l17.8-1.2 24.5 37.5V47.6l-6.3-.7c-.5-2.7 1.4-4.6 3.9-4.8l17-1Z"/>
        </svg>`;
      serviceTitle.textContent = isEn ? 'Notion Connected Successfully!' : 'Notion חובר בהצלחה!';
      if (name) {
        serviceDesc.textContent = isEn
          ? `Workspace "${name}" was successfully linked to GemMCP. Gemini can now search, read, and write Notion pages!`
          : `מרחב העבודה "${name}" חובר ל-GemMCP. ג'מיני יכול כעת לחפש, לקרוא וליצור דפים!`;
      }
    } else if (service === 'github') {
      iconBox.className = 'icon-wrap github-icon-theme';
      iconBox.innerHTML = `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="#181717">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>`;
      serviceTitle.textContent = isEn ? 'GitHub Connected Successfully!' : 'GitHub חובר בהצלחה!';
      if (name) {
        serviceDesc.textContent = isEn
          ? `GitHub account (@${name}) was linked to GemMCP. Gemini can now inspect repos, code files, and issues!`
          : `חשבון ה-GitHub שלך (@${name}) חובר ל-GemMCP. ג'מיני יכול כעת לחפש מאגרים, לקרוא קבצים ו-Issues!`;
      }
    } else if (service === 'supabase') {
      iconBox.className = 'icon-wrap supabase-icon-theme';
      iconBox.innerHTML = `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
          <path d="M21.362 9.354H12V.344a.344.344 0 0 0-.6-.23L.78 12.637a.86.86 0 0 0 .638 1.488h9.362v9.01a.344.344 0 0 0 .6.23l10.62-12.523a.86.86 0 0 0-.638-1.488z" fill="#3ECF8E"/>
        </svg>`;
      serviceTitle.textContent = isEn ? '⚡ Supabase Connected Successfully!' : '⚡ Supabase חובר בהצלחה!';
      if (name) {
        serviceDesc.textContent = isEn
          ? `Project "${name}" was linked to GemMCP. Gemini can now execute SQL and query your database tables!`
          : `הפרויקט "${name}" חובר ל-GemMCP. ג'מיני יכול כעת להריץ שאילתות ולקרוא נתונים!`;
      }
    }
  }
}

if (typeof getActiveLanguage === 'function') {
  getActiveLanguage((detected) => {
    applyOAuthTexts(detected);
  });
} else {
  applyOAuthTexts(lang);
}

  let timeLeft = 3;
  const interval = setInterval(() => {
    timeLeft -= 1;
    if (timerSeconds) timerSeconds.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      closeThisTab();
    }
  }, 1000);
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    try {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id);
        } else {
          window.close();
        }
      });
    } catch (e) {
      window.close();
    }
  });
}
