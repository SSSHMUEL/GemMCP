/**
 * GemMCP - i18n Internationalization Engine & Dictionary
 * Supports Hebrew ('he') & English ('en') with auto-detection from browser/system language
 * and manual toggle switch.
 */

const I18N_DICT = {
  he: {
    // General
    extName: 'GemMCP',
    subtitle: 'חיבור שירותי MCP ישירות ל-Gemini, Claude ו-ChatGPT',
    saveAllSettings: 'שמור את כל ההגדרות',
    saving: 'שומר הגדרות...',
    savedSuccess: 'ההגדרות נשמרו בהצלחה! ✅',
    errorPrefix: 'שגיאה: ',
    helpBtnTitle: 'מדריך והסבר: מה זה עושה ואיך להשתמש?',
    langToggleTitle: 'Switch to English / החלף לאנגלית',
    langToggleLabel: 'EN',
    checkForUpdatesTitle: 'בדוק עדכונים מ-GitHub',
    updateAvailable: 'גרסה חדשה זמינה ב-GitHub!',
    updateUpToDate: 'התוסף מעודכן לגרסה האחרונה!',
    updateChecking: 'בודק עדכונים...',
    updateError: 'שגיאה בבדיקת עדכון',
    updateOpenGitHub: 'פתח עמוד עדכון ↗',
    updateRunScriptHint: 'להתקנת עדכון: הפעל את update.bat בתיקיית הפרויקט',
    updateBridgeAutoConfirm: 'גרסה חדשה זמינה ({version})!\n\nשרת ה-Bridge פעיל. האם להוריד ולהתקין את העדכון אוטומטית כעת דרך ה-Bridge?',
    updateDownloading: '⏳ מוריד ומתקין עדכון דרך שרת ה-Bridge...',
    updateSuccessReload: '✅ העדכון הותקן בהצלחה! מרענן את התוסף...',
    updateBridgeOffline: 'שרת ה-Bridge כבוי. הפעל אותו כדי לעדכן אוטומטית בלחיצה אחת, או פתח את GitHub.',

    // Windows MCP Card
    winTitle: 'Windows MCP',
    winPillLocal: 'מקומי',
    winDesc: 'שליטה, קבצים, פקודות ואוטומציה ב-Windows',
    winPermHeader: '🛡️ בקרת הרשאות ואבטחה',
    winPermSub: 'בחר אילו פעולות ל-AI (ג\'מיני, קלוד ו-GPT) מותר לבצע במחשב שלך:',
    winPermReadTitle: '📖 קריאת קבצים ותיקיות (Read)',
    winPermReadSub: 'קריאת קוד, קבצי טקסט ורשימת קבצים',
    winPermWriteTitle: '✍️ כתיבה ויצירת קבצים (Write)',
    winPermWriteSub: 'יצירת קבצים חדשים או שינוי קבצים קיימים',
    winPermCmdTitle: '⚡ הרצת פקודות PowerShell / CMD',
    winPermCmdSub: 'הרצת סקריפטים, התקנות ופקודות טרמינל',
    updateCardTitle: 'עדכון גרסה',
    updateCheckBtn: 'בדוק',
    updateApplyBtn: 'עדכן עכשיו',
    sleepTitle: '😴 השהיית התוסף',
    sleepSub: 'מכבה את שרת הגשר ומונע ממנו לעלות מחדש מעצמו. כל עוד זה דלוק, התוסף לא יבצע שום פעולה במחשב - להחזרה, כבה את המתג כאן או הפעל את start-bridge.bat ידנית.',
    localDbTitle: 'מסד נתונים מקומי',
    localDbDesc: 'סריקה אחת של המחשב, שמורה לשימוש חוזר',
    bridgeSettingsTitle: 'הגדרות הגשר',
    bridgeSettingsDesc: 'הרשאות, תחומים ומגבלות - נשמר בשרת',
    bridgeSettingsSave: 'שמור בשרת',
    builtByPrefix: 'נבנה על ידי',

    builtByName: 'בינארי חכם',

    bridgeTokenLabel: 'טוקן אימות הגשר',
    // מצב הרצה, היקף קריאה, הפעלה לפי שיחה והתקנה - נוספו יחד עם התכונות
    // עצמן. בלי הערכים האלה הפופאפ הציג את שמות המפתחות למשתמש.
    runModeHeader: '🎚️ מצב הרצה',
    runModeSub: 'מתי ה-AI (ג\'מיני / קלוד / GPT) רשאי לבצע פעולה בלי לעצור ולשאול אותך:',
    runModeSafeTitle: '🛡️ בטוח',
    runModeSafeSub: 'רק פעולות קריאה רצות לבד. כל פעולה שמשנה משהו - כתיבה, מחיקה, הרצת פקודה, תוכנית - נעצרת לאישור.',
    runModeAutoTitle: '⚡ אוטונומי',
    runModeAutoSub: 'הכל רץ בלי לשאול, כולל מחיקה והרצת פקודות. ההרשאות שלמטה עדיין חלות, וכך גם התיקייה המורשית בשרת.',
    requireActivationTitle: '🔒 פעל רק בשיחות שהופעלו',
    requireActivationSub: 'בלי זה התוסף מתערב בכל שיחה ומוסיף סכימות להודעות, גם כשלא ביקשת ממנו כלום שם. לחיצה על הפעל בפאנל מפעילה את השיחה הנוכחית.',
    readScopeTitle: '📂 היקף הקריאה',
    readScopeSub: 'מאיפה מותר לקרוא. כתיבה ומחיקה נשארות תמיד מוגבלות לנתיב שבשרת, בלי קשר לבחירה כאן.',
    winPermInstallTitle: '📦 הורדה והתקנה מהאינטרנט',
    winPermInstallSub: 'הורדת חבילות והתקנת תוכנות (עוצר לאישור)',
    winPermAppTitle: '🚀 הפעלת יישומים (Launch Apps)',
    winPermAppSub: 'פתיחת אפליקציות מותקנות (Notepad, VSCode, Chrome וכו\')',
    winPermClipTitle: '📋 לוח העתקה (Clipboard)',
    winPermClipSub: 'קריאה והדבקה מלוח ההעתקה של Windows',
    winAllowedPathLabel: 'נתיב עבודה מורשה (Allowed Directory Scope)',
    winAllowedPathPlaceholder: 'לדוגמה: C:\\Users\\Name\\Projects (או השאר ריק לכל הכונן)',
    winAllowedPathHelper: 'הגבלת גישה לתיקייה ספציפית בלבד מטעמי אבטחה.',
    winOfflineBar: 'שרת Windows Bridge כבוי 🔴',
    winStartBtn: '⚡ הפעל שרת',
    winMissingNodeTitle: 'הפעלת השרת נכשלה (דרוש Node.js)',
    winMissingNodeDesc: 'שרת ה-Bridge לא הצליח לעלות. ייתכן ש-Node.js אינו מותקן במחשב שלך.',
    winDownloadNodeBtn: 'הורדת Node.js חינם',
    winRetryBtn: 'נסה שוב',
    winTestBtn: 'בדוק חיבור ל-Windows Bridge',
    winStopBtn: 'כבה שרת 🛑',
    winShuttingDown: 'מכבה שרת... ⏳',
    winShutdownSuccess: 'שרת ה-Bridge כובה בהצלחה! 🛑',

    // Scraper Card
    fetchTitle: 'Web Scraper',
    fetchPillAlways: 'פעיל תמיד',
    fetchDesc: 'סריקת אתרים ציבוריים ואישיים מחוברים',
    fetchInfoBadge: 'גישה לאתרים וחשבונות',
    fetchInfoText: 'שירות ה-Web Scraper מאפשר ל-Gemini, Claude ו-ChatGPT לקרוא כל אתר אינטרנט ציבורי, וכן לגשת ישירות לאתרים אישיים וכרטיסיות פתוחות שהמשתמש כבר מחובר אליהם בחשבונו האישי.',

    // Supabase Card
    supabaseTitle: 'Supabase',
    supabaseDesc: 'מסד נתונים ו-SQL בזמן אמת',
    supabaseOauthBtn: 'התחברות ל-Supabase',
    supabaseConnectedBtn: 'התחברות פעילה',
    supabaseManualToggle: '⚙️ הגדרת מפתחות ידנית',
    supabaseUrlLabel: 'Project URL',
    supabaseKeyLabel: 'API Key (service_role / anon)',

    // Notion Card
    notionTitle: 'Notion',
    notionDesc: 'ניהול פתקים, מסמכים ומשימות',
    notionOauthBtn: 'התחברות ל-Notion',
    notionConnectedBtn: 'התחברות פעילה',
    notionManualToggle: '⚙️ הגדרת מפתחות ידנית',
    notionSecretLabel: 'Internal Integration Secret',
    notionCreateSecretLink: 'יצירת אינטגרציה ↗',
    notionSecretHelper: 'וודא ששיתפת את דפי ה-Notion שלך עם ה-Integration שיצרת.',

    // GitHub Card
    githubTitle: 'GitHub',
    githubDesc: 'קריאת קוד, Repos ו-Issues',
    githubOauthBtn: 'התחברות עם GitHub',
    githubConnectedBtn: 'התחברות פעילה',
    githubManualToggle: '⚙️ הגדרת מפתחות ידנית',
    githubTokenLabel: 'Personal Access Token (PAT)',
    githubCreateTokenLink: 'יצירת טוקן ↗',
    githubTokenHelper: 'דרושות הרשאות repo או read:user.',

    // Custom MCP Card
    customTitle: 'שרתי MCP מותאמים',
    customDesc: 'הוספת שרתים מותאמים, קוד חיבור ופרומפטים',
    customCountPill: ' מוגדרים',
    customAddBtn: 'הוסף שרת MCP מותאם אישית',
    customServerNamePlaceholder: 'שם השרת (לדוגמה: Filesystem)',
    customServerUrlPlaceholder: 'כתובת URL או SSE Endpoint',
    customServerCommandPlaceholder: 'או פקודת הרצה מקומית (למשל: npx -y @modelcontextprotocol/server-filesystem)',
    customRemoveBtn: 'הסר',

    // Local AI API Card
    apiCardTitle: 'שרת ומפתח API',
    apiPillReady: 'מוכן לחיבור',
    apiCardDesc: 'חיבור Cursor, Python, Cline ואפליקציות בחינם',
    apiHowItWorksTitle: 'איך זה עובד ולמה זה בחינם?',
    apiHowItWorksDesc: 'הגשר מאפשר לתוכנות חיצוניות לשלוח שאילתות ישירות לחשבון הבינה הפתוח בדפדפן שלך (Gemini, Claude, ChatGPT), ללא עלות Tokens.',
    apiRoutingExamplesTitle: '🎯 ניתוב בינות אוטומטי (לפי שדה model בקוד שלך):',
    apiRoutingGemini: '• model: "gemini" ➔ מריץ ב-gemini.google.com',
    apiRoutingClaude: '• model: "claude" ➔ מריץ ב-claude.ai',
    apiRoutingChatGPT: '• model: "chatgpt" ➔ מריץ ב-chatgpt.com',
    apiTabNotice: '📌 פתיחה אוטומטית: כרטיסיית רקע נפרדת נפתחת עבור ה-API מבלי להפריע לכרטיסיות שאתה עובד בהן בדפדפן.',
    apiKeyLabel: 'מפתח API מאובטח (Bearer Key)',
    apiGenerateNewBtn: 'צור מפתח API חדש ומאובטח',
    apiBaseUrlLabel: 'Base URL מקומי (באותו המחשב)',
    apiBaseUrlHelper: 'הדבק כתובת זו ב-Cursor / Cline / סקריפטים באותו המחשב.',
    apiNetworkUrlLabel: 'Base URL לרשת (מכשירים אחרים ב-Wi-Fi)',
    apiNetworkUrlHelper: 'הדבק כתובת זו באפליקציות בטלפון או במחשבים אחרים באותה הרשת.',
    apiPublicTunnelLabel: '🌍 מנהרת אינטרנט ציבורית (גישה מכל מקום בעולם ב-HTTPS)',
    apiPublicTunnelHelper: 'מאפשר לאפליקציות ולמכשירים מחוץ לבית לשלוח שאילתות דרך האינטרנט בחינם ובאופן מאובטח ב-HTTPS.',
    startTunnelBtn: '⚡ הפעל מנהרה',
    stopTunnelBtn: '🛑 עצור מנהרה',
    startingTunnel: '⏳ מפעיל מנהרה...',
    apiTestBtn: 'בדוק קריאת API לדוגמה',
    apiGuideBtn: 'מדריך חיבור מלא, דוגמאות קוד ומבנה השאילתה ↗',
    apiGuideModalTitle: 'מדריך חיבור לשרת ה-API של GemMCP',
    copyBtn: 'העתק 📋',

    // Shared Actions / Buttons / Pills
    pillConnected: 'מחובר',
    pillDisconnected: 'מנותק',
    testConnBtn: 'בדוק חיבור',
    disconnectBtn: 'התנתק',
    promptEditorToggle: '📝 עריכת פרומפט והנחיות ל-AI (Gemini/Claude/GPT)',
    saveBtnText: 'שמור',
    saveBtnSuccess: 'נשמר בהצלחה! ✅',
    promptResetBtn: '↺ שחזר לברירת מחדל',
    promptHelper: 'הנחיות אלו מוזרקות ל-Gemini, Claude ו-ChatGPT כשהשירות פעיל.',
    promptLabelPrefix: 'הנחיות לכלי ',
    testingMsg: 'בודק חיבור...',
    connectedOkMsg: 'החיבור תקין ומגיב! ✅',
    connectFailedMsg: 'שגיאה: החיבור נכשל. בדוק את ההגדרות.',

    // Floating widget in Gemini / Claude / ChatGPT
    widgetTitle: 'GemMCP',
    widgetDragHeader: 'לחץ וגרור כדי להזיז את החלונית',
    widgetRescanBtn: 'סריקה מחדש',
    widgetRescanTitle: 'סרוק ובצע פקודה אחרונה מהצ\'אט (ריענון)',
    widgetInjectBtn: 'הפעל GemMCP',
    widgetActiveServices: 'שירותים פעילים בשיחה:',
    widgetWinServerLabel: 'שרת Windows:',
    widgetWinChecking: 'בבדיקה...',
    widgetWinOnline: 'פעיל ומחובר',
    widgetWinOffline: 'כבוי',
    widgetWinStartBtn: '⚡ הפעל',
    widgetWinStopBtn: '🛑 כבה',
    widgetWinOfflineHint: 'השרת כבוי / חסר Node.js. ',
    widgetInstallNodeLink: 'התקנה 📥',
    widgetAutoRun: 'אישור אוטומטי (Auto Run)',
    widgetLogsTitle: 'לוג פעילות',
    widgetLogsReady: 'GemMCP מוכן לפעולה',
    widgetErrorsBadge: ' שגיאות',
    widgetApproveBtn: '✅ אשר ובצע',
    widgetRejectBtn: '✕ בטל',
    widgetExecutionDone: 'הפקודה בוצעה בהצלחה!',

    // Help Modal
    helpModalTitle: 'מה זה GemMCP ואיך משתמשים?',
    helpWhatTitle: 'מה התוסף הזה עושה?',
    helpWhatDesc: '<strong>GemMCP</strong> מחבר את ממשקי הצ\'אט בדפדפן (Gemini, Claude ו-ChatGPT) לעולם החיצון (Model Context Protocol). הוא מעניק למודלי ה-AI "ידיים ורגליים" לבצע פעולות אמיתיות:',
    helpFeatWin: '💻 <strong>Windows MCP</strong> – קריאה וכתיבה של קבצים, הרצת פקודות טרמינל (PowerShell/CMD), והפעלת תוכנות במחשב.',
    helpFeatSupa: '⚡ <strong>Supabase</strong> – תשאול וניהול טבלאות SQL ומסדי נתונים ישירות מהשיחה.',
    helpFeatNotion: '📝 <strong>Notion</strong> – קריאה וכתיבה של דפים, משימות ומאגרי מידע ב-Notion.',
    helpFeatGit: '🐙 <strong>GitHub</strong> – חיפוש מאגרי קוד, קריאת קבצים, Issues ו-Pull Requests.',
    helpFeatFetch: '🌐 <strong>Web Scraper</strong> – גלישה וקריאת תוכן מאתרים חיים בזמן אמת.',
    helpFeatCustom: '🧩 <strong>שרתי MCP מותאמים</strong> – הוספת כל שרת MCP חיצוני (Local או SSE / Remote).',
    helpFeatApi: '🔑 <strong>שרת ומפתח API</strong> – חיבור תוכנות חיצוניות (Cursor, Python, Cline) לחשבונות ה-AI בדפדפן בחינם וללא עלות Tokens.',
    helpHowTitle: 'איך משתמשים בזה? (3 צעדים פשוטים)',
    helpStep1Title: 'חיבור והפעלת השירותים הרצויים:',
    helpStep1Desc: 'בחלון זה, לחץ על השירות שברצונך לחבר (התחברות בקליק או הזנת API Key) והפעל את המתג שלו למצב פעיל (ON). כל שינוי נשמר אוטומטית באופן מיידי.',
    helpStep2Title: 'גלישה לאחד מאתרי ה-AI הנתמכים:',
    helpStep2Desc: 'פתח את <a href="https://gemini.google.com" target="_blank" class="help-link">Gemini</a>, <a href="https://claude.ai" target="_blank" class="help-link">Claude</a> או <a href="https://chatgpt.com" target="_blank" class="help-link">ChatGPT</a>. תראה בפינת המסך את הווידג\'ט הצף של GemMCP.',
    helpStep3Title: 'הפעלת הפרומפט ודיבור חופשי:',
    helpStep3Desc: 'לחץ על כפתור <strong>"הפעל GemMCP"</strong> בווידג\'ט להזרקת ההנחיות (או תייג <code>@GemMCP</code>). כעת בקש מה-AI כל משימה (למשל: <em>"צור קובץ index.html על שולחן העבודה"</em> או <em>"בדוק אילו טבלאות יש לי ב-Supabase"</em>).',
    helpSecTitle: 'אישור אוטומטי (Auto Run) ובקרת אבטחה',
    helpSecDesc: 'בברירת מחדל, מצב <strong>Auto Run</strong> מופעל ומבצע פעולות מיד. במידה ותרצה לאשר כל פקודה/קובץ ידנית לפני ביצועה, כבה את מתג ה-Auto Run בווידג\'ט הצף.',
    helpCloseBtn: 'הבנתי, תודה!'
  },

  en: {
    // General
    extName: 'GemMCP',
    subtitle: 'Bridge MCP services directly into Gemini, Claude & ChatGPT',
    saveAllSettings: 'Save All Settings',
    saving: 'Saving settings...',
    savedSuccess: 'Settings saved successfully! ✅',
    errorPrefix: 'Error: ',
    helpBtnTitle: 'Guide & Help: What is this and how to use?',
    langToggleTitle: 'עבור לעברית / Switch to Hebrew',
    langToggleLabel: 'עב',
    checkForUpdatesTitle: 'Check for updates on GitHub',
    updateAvailable: 'New version available on GitHub!',
    updateUpToDate: 'GemMCP is up to date!',
    updateChecking: 'Checking for updates...',
    updateError: 'Failed to check for updates',
    updateOpenGitHub: 'Open Release Page ↗',
    updateRunScriptHint: 'To update: Run update.bat in project folder',
    updateBridgeAutoConfirm: 'New version available ({version})!\n\nWindows Bridge is online. Would you like to download and install the update automatically now?',
    updateDownloading: '⏳ Downloading and applying update via Bridge...',
    updateSuccessReload: '✅ Update installed successfully! Reloading extension...',
    updateBridgeOffline: 'Bridge server is offline. Start it to update in 1-click, or open GitHub.',

    // Windows MCP Card
    winTitle: 'Windows MCP',
    winPillLocal: 'Local',
    winDesc: 'OS Control, Files, Commands & Automation for Windows',
    winPermHeader: '🛡️ Security & Permission Controls',
    winPermSub: 'Select which actions the AI (Gemini, Claude, GPT) is allowed to execute on your machine:',
    winPermReadTitle: '📖 File & Directory Reading (Read)',
    winPermReadSub: 'Allows Gemini to read code, text files and view directory trees',
    winPermWriteTitle: '✍️ File Creation & Writing (Write)',
    winPermWriteSub: 'Allows Gemini to create new files or modify existing files',
    winPermCmdTitle: '⚡ Run PowerShell / CMD Commands',
    winPermCmdSub: 'Execute terminal scripts, install packages and run CLI commands. Note: this is the one permission the allowed-folder limit cannot contain - a command can reach anywhere on the machine.',
    updateCardTitle: 'Version update',
    updateCheckBtn: 'Check',
    updateApplyBtn: 'Update now',
    sleepTitle: '😴 Pause the extension',
    sleepSub: 'Shuts the bridge down and stops it waking itself again. While this is on the extension performs no action on your computer - to bring it back, switch this off or run start-bridge.bat yourself.',
    localDbTitle: 'Local database',
    localDbDesc: 'Scan this computer once, keep the result',
    bridgeSettingsTitle: 'Bridge settings',
    bridgeSettingsDesc: 'Permissions, scope and limits - stored on the server',
    bridgeSettingsSave: 'Save to server',
    builtByPrefix: 'Built by',

    builtByName: 'Smart Binary',

    bridgeTokenLabel: 'Bridge auth token',
    runModeHeader: '🎚️ Run mode',
    runModeSub: 'When Gemini may act without stopping to ask you:',
    runModeSafeTitle: '🛡️ Safe',
    runModeSafeSub: 'Only read actions run on their own. Anything that changes something stops for approval.',
    runModeAutoTitle: '⚡ Autonomous',
    runModeAutoSub: 'Everything runs without asking, including deleting and running commands. The permissions below still apply.',
    requireActivationTitle: '🔒 Only act in conversations you activated',
    requireActivationSub: 'Without this the extension takes part in every chat, adding schemas to your messages even where you asked it for nothing. Clicking Activate in the panel activates the current conversation.',
    readScopeTitle: '📂 Read scope',
    readScopeSub: 'Where reading is allowed from. Writing and deleting stay limited to the server path regardless of this choice.',
    winPermInstallTitle: '📦 Download and install from the internet',
    winPermInstallSub: 'Downloads an exe or msi and runs it. The only action that runs code you have not seen. It always asks first, and can be cancelled from the panel.',
    winPermAppTitle: '🚀 Launch Desktop Apps',
    winPermAppSub: 'Open installed apps (VSCode, Notepad, Chrome, Spotify, etc.)',
    winPermClipTitle: '📋 System Clipboard',
    winPermClipSub: 'Read and paste text from the Windows clipboard',
    winAllowedPathLabel: 'Allowed Directory Scope',
    winAllowedPathPlaceholder: 'e.g. C:\\Users\\Name\\Projects (or leave empty for entire drive)',
    winAllowedPathHelper: 'Restrict Gemini to a specific folder only for extra security.',
    winOfflineBar: 'Windows Bridge Server Offline 🔴',
    winStartBtn: '⚡ Start Server',
    winMissingNodeTitle: 'Server Launch Failed (Node.js Required)',
    winMissingNodeDesc: 'The Bridge server could not start. Node.js might not be installed on your computer.',
    winDownloadNodeBtn: 'Download Node.js Free',
    winRetryBtn: 'Retry',
    winTestBtn: 'Test Windows Bridge Connection',
    winStopBtn: 'Stop Server 🛑',
    winShuttingDown: 'Stopping server... ⏳',
    winShutdownSuccess: 'Bridge server stopped successfully! 🛑',

    // Scraper Card
    fetchTitle: 'Web Scraper',
    fetchPillAlways: 'Always Active',
    fetchDesc: 'Scrape public & authenticated web pages',
    fetchInfoBadge: 'Web & Session Access',
    fetchInfoText: 'The Web Scraper tool enables Gemini to read any public webpage, as well as access personal logged-in sessions and open browser tabs.',

    // Supabase Card
    supabaseTitle: 'Supabase',
    supabaseDesc: 'Real-time Database & SQL Execution',
    supabaseOauthBtn: 'Connect with Supabase',
    supabaseConnectedBtn: 'Connected',
    supabaseManualToggle: '⚙️ Manual API Keys',
    supabaseUrlLabel: 'Project URL',
    supabaseKeyLabel: 'API Key (service_role / anon)',

    // Notion Card
    notionTitle: 'Notion',
    notionDesc: 'Notes, Docs, Tasks & Databases',
    notionOauthBtn: 'Connect with Notion',
    notionConnectedBtn: 'Connected',
    notionManualToggle: '⚙️ Manual Integration Secret',
    notionSecretLabel: 'Internal Integration Secret',
    notionCreateSecretLink: 'Create Integration ↗',
    notionSecretHelper: 'Ensure you shared your Notion workspace pages with your Integration.',

    // GitHub Card
    githubTitle: 'GitHub',
    githubDesc: 'Code Repositories, Files & Issues',
    githubOauthBtn: 'Connect with GitHub',
    githubConnectedBtn: 'Connected',
    githubManualToggle: '⚙️ Manual Access Token',
    githubTokenLabel: 'Personal Access Token (PAT)',
    githubCreateTokenLink: 'Generate Token ↗',
    githubTokenHelper: 'Requires repo or read:user scopes.',

    // Custom MCP Card
    customTitle: 'Custom MCP Servers',
    customDesc: 'Add custom endpoints, SSE tools & system prompts',
    customCountPill: ' Configured',
    customAddBtn: 'Add Custom MCP Server',
    customServerNamePlaceholder: 'Server Name (e.g. Filesystem)',
    customServerUrlPlaceholder: 'URL or SSE Endpoint',
    customServerCommandPlaceholder: 'Or local command (e.g. npx -y @modelcontextprotocol/server-filesystem)',
    customRemoveBtn: 'Remove',

    // Local AI API Card
    apiCardTitle: 'AI API Server',
    apiPillReady: 'Ready to Connect',
    apiCardDesc: 'Connect Cursor, Python, Cline & custom apps for free',
    apiHowItWorksTitle: 'How does it work and why is it free?',
    apiHowItWorksDesc: 'The bridge allows external tools to route queries directly to your active browser AI session (Gemini, Claude, ChatGPT) with zero token costs.',
    apiRoutingExamplesTitle: '🎯 Smart AI Routing (via "model" field in your code):',
    apiRoutingGemini: '• model: "gemini" ➔ Executes on gemini.google.com',
    apiRoutingClaude: '• model: "claude" ➔ Executes on claude.ai',
    apiRoutingChatGPT: '• model: "chatgpt" ➔ Executes on chatgpt.com',
    apiTabNotice: '📌 Auto-Open: A dedicated background tab is opened for the API without interrupting your active browser tabs.',
    apiKeyLabel: 'Secure API Key (Bearer Key)',
    apiGenerateNewBtn: 'Generate New Secure API Key',
    apiBaseUrlLabel: 'Local Base URL (This Computer)',
    apiBaseUrlHelper: 'Paste this into Cursor / Cline / scripts on this machine.',
    apiNetworkUrlLabel: 'Network Base URL (Other Devices on Wi-Fi)',
    apiNetworkUrlHelper: 'Paste this into apps on your phone or other computers on the same network.',
    apiPublicTunnelLabel: '🌍 Public Internet Tunnel (HTTPS from Anywhere)',
    apiPublicTunnelHelper: 'Allows mobile apps and devices outside your home to send queries over the internet via secure HTTPS.',
    startTunnelBtn: '⚡ Start Tunnel',
    stopTunnelBtn: '🛑 Stop Tunnel',
    startingTunnel: '⏳ Starting tunnel...',
    apiTestBtn: 'Test Sample API Call',
    apiGuideBtn: 'Full Setup Guide, Code Examples & Schema ↗',
    apiGuideModalTitle: 'GemMCP AI API Connection & Query Guide',
    copyBtn: 'Copy 📋',

    // Shared Actions / Buttons / Pills
    pillConnected: 'Connected',
    pillDisconnected: 'Disconnected',
    testConnBtn: 'Test Connection',
    disconnectBtn: 'Disconnect',
    promptEditorToggle: '📝 Edit AI Instructions & Prompts (Gemini/Claude/GPT)',
    saveBtnText: 'Save',
    saveBtnSuccess: 'Saved! ✅',
    promptResetBtn: '↺ Reset to Default',
    promptHelper: 'Injected into Gemini, Claude, and ChatGPT when the service is active.',
    promptLabelPrefix: 'Instructions for ',
    testingMsg: 'Testing connection...',
    connectedOkMsg: 'Connected and responding! ✅',
    connectFailedMsg: 'Error: Connection failed. Check your settings.',

    // Floating widget in Gemini / Claude / ChatGPT
    widgetTitle: 'GemMCP',
    widgetDragHeader: 'Click and drag to move panel',
    widgetRescanBtn: 'Rescan Chat',
    widgetRescanTitle: 'Rescan and execute latest chat command (Refresh)',
    widgetInjectBtn: 'Activate GemMCP',
    widgetActiveServices: 'Active Chat Services:',
    widgetWinServerLabel: 'Windows Server:',
    widgetWinChecking: 'Checking...',
    widgetWinOnline: 'Active & Online',
    widgetWinOffline: 'Offline',
    widgetWinStartBtn: '⚡ Start',
    widgetWinStopBtn: '🛑 Stop',
    widgetWinOfflineHint: 'Server offline / Node.js missing. ',
    widgetInstallNodeLink: 'Install 📥',
    widgetAutoRun: 'Auto-Run Approval',
    widgetLogsTitle: 'Activity Log',
    widgetLogsReady: 'GemMCP ready',
    widgetErrorsBadge: ' errors',
    widgetApproveBtn: '✅ Approve & Run',
    widgetRejectBtn: '✕ Cancel',
    widgetExecutionDone: 'Command executed successfully!',

    // Help Modal
    helpModalTitle: 'What is GemMCP and how to use it?',
    helpWhatTitle: 'What does this extension do?',
    helpWhatDesc: '<strong>GemMCP</strong> bridges browser AI interfaces (Gemini, Claude & ChatGPT) directly to the external world using the Model Context Protocol (MCP), giving your AI assistant real tools and automation:',
    helpFeatWin: '💻 <strong>Windows MCP</strong> – Read/write local files, run PowerShell/CMD commands, and launch apps.',
    helpFeatSupa: '⚡ <strong>Supabase</strong> – Query SQL databases and manage backend records live.',
    helpFeatNotion: '📝 <strong>Notion</strong> – Search, read, and create Notion pages, docs, and tasks.',
    helpFeatGit: '🐙 <strong>GitHub</strong> – Browse code repositories, fetch files, and manage issues.',
    helpFeatFetch: '🌐 <strong>Web Scraper</strong> – Live webpage crawling and authenticated tab scraping.',
    helpFeatCustom: '🧩 <strong>Custom MCP Servers</strong> – Connect any custom local or remote MCP SSE server.',
    helpFeatApi: '🔑 <strong>Local AI API Server</strong> – Connect external tools & code (Cursor, Python, Cline) to your browser AI models for free without token costs.',
    helpHowTitle: 'How to use? (3 Simple Steps)',
    helpStep1Title: 'Connect & Enable Services:',
    helpStep1Desc: 'In this popup, click to connect your services (1-click OAuth or manual keys) and toggle their switches ON. Changes are saved automatically in real time.',
    helpStep2Title: 'Open Gemini, Claude or ChatGPT:',
    helpStep2Desc: 'Go to <a href="https://gemini.google.com" target="_blank" class="help-link">Gemini</a>, <a href="https://claude.ai" target="_blank" class="help-link">Claude</a> or <a href="https://chatgpt.com" target="_blank" class="help-link">ChatGPT</a>. You will see the floating GemMCP widget.',
    helpStep3Title: 'Activate & Prompt freely:',
    helpStep3Desc: 'Click <strong>"Activate GemMCP"</strong> on the widget to inject prompts (or type <code>@GemMCP</code>). Ask the AI for any task (e.g. <em>"Create an index.html file on my desktop"</em> or <em>"List my Supabase tables"</em>).',
    helpSecTitle: 'Auto-Run & Security Control',
    helpSecDesc: 'By default, <strong>Auto Run</strong> executes verified actions automatically. If you prefer to review every action beforehand, disable Auto-Run in the floating widget.',
    helpCloseBtn: 'Got it, thanks!'
  }
};

/**
 * Detect the default language based on navigator.language / system locale
 * @returns {'he' | 'en'}
 */
function detectSystemLanguage() {
  const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (lang.startsWith('he') || lang.startsWith('iw')) {
    return 'he';
  }
  return 'en';
}

/**
 * Get current active language setting (stored or detected)
 * @param {function(string)} callback
 */
function getActiveLanguage(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['preferredLanguage'], (data) => {
      if (data && (data.preferredLanguage === 'he' || data.preferredLanguage === 'en')) {
        callback(data.preferredLanguage);
      } else {
        const detected = detectSystemLanguage();
        callback(detected);
      }
    });
  } else {
    callback(detectSystemLanguage());
  }
}

/**
 * Set active language
 * @param {'he' | 'en'} lang
 * @param {function()} [callback]
 */
function setActiveLanguage(lang, callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ preferredLanguage: lang }, () => {
      if (callback) callback();
    });
  } else if (callback) {
    callback();
  }
}

/**
 * Get localized string by key
 * @param {string} key
 * @param {string} [lang]
 * @returns {string}
 */
function t(key, lang) {
  const currentLang = lang || window.__gemmcp_current_lang || detectSystemLanguage();
  const dict = I18N_DICT[currentLang] || I18N_DICT.en;
  return dict[key] || I18N_DICT.en[key] || key;
}

if (typeof window !== 'undefined') {
  window.I18N_DICT = I18N_DICT;
  window.detectSystemLanguage = detectSystemLanguage;
  window.getActiveLanguage = getActiveLanguage;
  window.setActiveLanguage = setActiveLanguage;
  window.t = t;
}
