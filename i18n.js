/**
 * GemMCP - i18n Internationalization Engine & Dictionary
 * Supports Hebrew ('he') & English ('en') with auto-detection from browser/system language
 * and manual toggle switch.
 */

const I18N_DICT = {
  he: {
    // General
    extName: 'GemMCP',
    subtitle: 'חיבור שירותי MCP חיצוניים ישירות ל-Gemini',
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
    winPermSub: 'בחר אילו פעולות לג\'מיני מותר לבצע במחשב שלך:',
    winPermReadTitle: '📖 קריאת קבצים ותיקיות (Read)',
    winPermReadSub: 'מאפשר לג\'מיני לקרוא קבצי קוד, טקסט ולראות רשימת קבצים',
    winPermWriteTitle: '✍️ כתיבה ויצירת קבצים (Write)',
    winPermWriteSub: 'מאפשר לג\'מיני ליצור קבצים חדשים או לשנות קבצים קיימים',
    winPermCmdTitle: '⚡ הרצת פקודות PowerShell / CMD',
    winPermCmdSub: 'הרצת סקריפטים, התקנת חבילות ופקודות טרמינל',
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
    fetchInfoText: 'שירות ה-Web Scraper מאפשר לג\'מיני לקרוא כל אתר אינטרנט ציבורי, וכן לגשת ישירות לאתרים אישיים וכרטיסיות פתוחות שהמשתמש כבר מחובר אליהם בחשבונו האישי.',

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

    // Shared Actions / Buttons / Pills
    pillConnected: 'מחובר',
    pillDisconnected: 'מנותק',
    testConnBtn: 'בדוק חיבור',
    disconnectBtn: 'התנתק',
    promptEditorToggle: '📝 עריכת פרומפט והנחיות ל-Gemini',
    saveBtnText: 'שמור',
    saveBtnSuccess: 'נשמר בהצלחה! ✅',
    promptResetBtn: '↺ שחזר לברירת מחדל',
    promptHelper: 'הנחיות אלו מוזרקות לג\'מיני כשהשירות פעיל ובתפריט ה-@.',
    promptLabelPrefix: 'הנחיות לכלי ',
    testingMsg: 'בודק חיבור...',
    connectedOkMsg: 'החיבור תקין ומגיב! ✅',
    connectFailedMsg: 'שגיאה: החיבור נכשל. בדוק את ההגדרות.',

    // Floating widget in Gemini
    widgetTitle: 'GemMCP',
    widgetDragHeader: 'לחץ וגרור כדי להזיז את החלונית',
    widgetRescanBtn: 'סריקה מחדש',
    widgetRescanTitle: 'סרוק ובצע פקודה אחרונה מהצ\'אט (ריענון)',
    widgetInjectBtn: 'הפעל GemMCP',
    widgetStopBtn: 'עצור',
    widgetResumeBtn: 'המשך',
    widgetStopTitle: 'עצור שליחה וקבלת פקודות',
    widgetResumeTitle: 'חדש שליחה וקבלת פקודות',
    widgetStoppedLog: '🛑 פעילות GemMCP נעצרה (שליחה וקבלת פקודות הופסקו)',
    widgetResumedLog: '▶️ פעילות GemMCP חודשה (מוכן לקבלת ושליחת פקודות)',
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
    helpWhatDesc: '<strong>GemMCP</strong> מחבר את ממשק Gemini Web הרגיל בדפדפן לעולם החיצון (Model Context Protocol). הוא מעניק לג\'מיני "ידיים ורגליים" לבצע פעולות אמיתיות:',
    helpFeatWin: '💻 <strong>Windows MCP</strong> – קריאה וכתיבה של קבצים, הרצת פקודות טרמינל (PowerShell/CMD), והפעלת תוכנות במחשב.',
    helpFeatSupa: '⚡ <strong>Supabase</strong> – תשאול וניהול טבלאות SQL ומסדי נתונים ישירות מהשיחה.',
    helpFeatNotion: '<svg style="width:14px;height:14px;vertical-align:-2px;display:inline-block;" viewBox="0 0 122 122" fill="none"><path d="M6 12.5 74.5 7.5c8.4-.7 10.6-.2 15.9 3.6l21.9 15.4c3.6 2.6 4.8 3.3 4.8 6.2v83.4c0 5.3-1.9 8.4-8.6 8.9l-79.5 4.8c-5.1.2-7.5-.5-10.2-3.8L4.7 105.9C1.8 102 .6 99.1.6 95.7V21.4C.6 17.1 2.5 13.5 6 12.5Z" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M74.5 7.5 6 12.5C2.5 13.5.6 17.1.6 21.4v74.3c0 3.4 1.2 6.3 4.1 10.2l14.1 18.3c2.7 3.3 5.1 4 10.2 3.8l79.5-4.8c6.7-.5 8.6-3.6 8.6-8.9V32.7c0-2.7-1.1-3.5-4.3-5.8l-.5-.4-21.9-15.4c-5.3-3.8-7.5-4.3-15.9-3.6ZM31 24.4c-6.5.4-8 .5-11.7-2.5L9.9 14.4c-1-1-.5-2.2.9-2.4l65.9-4.8c5.5-.5 8.4 1.4 10.6 3.1l11.4 8.2c.3.2 1.1 1.2.1 1.2l-68 4.1-.2.1ZM23.4 111V39.3c0-3.1 1-4.6 3.9-4.8l78-4.6c2.7-.2 3.9 1.5 3.9 4.6v71.2c0 3.1-.5 5.8-4.8 6l-74.6 4.3c-4.3.2-6.4-1.2-6.4-5Zm73.7-68c.5 2.2 0 4.3-2.2 4.6l-3.6.7v52.8c-3.1 1.7-6 2.7-8.4 2.7-3.9 0-4.8-1.2-7.7-4.8L51.5 61.9v35.9l7.5 1.7s0 4.3-6 4.3l-16.6 1c-.5-1 0-3.4 1.7-3.9l4.3-1.2V50.5l-6-.5c-.5-2.2.7-5.3 4.1-5.5l17.8-1.2 24.5 37.5V47.6l-6.3-.7c-.5-2.7 1.4-4.6 3.9-4.8l17-1Z" fill="#000000"/></svg> <strong>Notion</strong> – קריאה וכתיבה של דפים, משימות ומאגרי מידע ב-Notion.',
    helpFeatGit: '<svg style="width:14px;height:14px;vertical-align:-2px;display:inline-block;" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg> <strong>GitHub</strong> – חיפוש מאגרי קוד, קריאת קבצים, Issues ו-Pull Requests.',
    helpFeatFetch: '🌐 <strong>Web Scraper</strong> – גלישה וקריאת תוכן מאתרים חיים בזמן אמת.',
    helpFeatCustom: '🧩 <strong>שרתי MCP מותאמים</strong> – הוספת כל שרת MCP חיצוני (Local או SSE / Remote).',
    helpHowTitle: 'איך משתמשים בזה? (3 צעדים פשוטים)',
    helpStep1Title: 'חיבור והפעלת השירותים הרצויים:',
    helpStep1Desc: 'בחלון זה, לחץ על השירות שברצונך לחבר (התחברות בקליק או הזנת API Key) והפעל את המתג שלו למצב פעיל (ON). כל שינוי נשמר אוטומטית באופן מיידי.',
    helpStep2Title: 'גלישה לאתר Gemini:',
    helpStep2Desc: 'פתח את <a href="https://gemini.google.com" target="_blank" class="help-link">gemini.google.com ↗</a>. תראה בפינת המסך את הווידג\'ט הצף של GemMCP.',
    helpStep3Title: 'הפעלת הפרומפט ודיבור חופשי:',
    helpStep3Desc: 'לחץ על כפתור <strong>"הפעל GemMCP"</strong> בווידג\'ט להזרקת ההנחיות (או תייג <code>@GemMCP</code>). כעת בקש מג\'מיני כל משימה (למשל: <em>"צור קובץ index.html על שולחן העבודה"</em> או <em>"בדוק אילו טבלאות יש לי ב-Supabase"</em>).',
    helpSecTitle: 'אישור אוטומטי (Auto Run) ובקרת אבטחה',
    helpSecDesc: 'בברירת מחדל, מצב <strong>Auto Run</strong> מופעל ומבצע פעולות מיד. במידה ותרצה לאשר כל פקודה/קובץ ידנית לפני ביצועה, כבה את מתג ה-Auto Run בווידג\'ט הצף.',
    helpCloseBtn: 'הבנתי, תודה!'
  },

  en: {
    // General
    extName: 'GemMCP',
    subtitle: 'Bridge external MCP services directly into Google Gemini',
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
    winPermSub: 'Select which actions Gemini is allowed to execute on your machine:',
    winPermReadTitle: '📖 File & Directory Reading (Read)',
    winPermReadSub: 'Allows Gemini to read code, text files and view directory trees',
    winPermWriteTitle: '✍️ File Creation & Writing (Write)',
    winPermWriteSub: 'Allows Gemini to create new files or modify existing files',
    winPermCmdTitle: '⚡ Run PowerShell / CMD Commands',
    winPermCmdSub: 'Execute terminal scripts, install packages and run CLI commands',
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

    // Shared Actions / Buttons / Pills
    pillConnected: 'Connected',
    pillDisconnected: 'Disconnected',
    testConnBtn: 'Test Connection',
    disconnectBtn: 'Disconnect',
    promptEditorToggle: '📝 Edit System Prompt for Gemini',
    saveBtnText: 'Save',
    saveBtnSuccess: 'Saved! ✅',
    promptResetBtn: '↺ Reset to Default',
    promptHelper: 'Injected into Gemini when the service is active and in @ menu.',
    promptLabelPrefix: 'Instructions for ',
    testingMsg: 'Testing connection...',
    connectedOkMsg: 'Connected and responding! ✅',
    connectFailedMsg: 'Error: Connection failed. Check your settings.',

    // Floating widget in Gemini
    widgetTitle: 'GemMCP',
    widgetDragHeader: 'Click and drag to move panel',
    widgetRescanBtn: 'Rescan Chat',
    widgetRescanTitle: 'Rescan and execute latest chat command (Refresh)',
    widgetInjectBtn: 'Activate GemMCP',
    widgetStopBtn: 'Stop',
    widgetResumeBtn: 'Resume',
    widgetStopTitle: 'Stop sending and receiving commands',
    widgetResumeTitle: 'Resume sending and receiving commands',
    widgetStoppedLog: '🛑 GemMCP stopped (sending and receiving paused)',
    widgetResumedLog: '▶️ GemMCP resumed (listening for commands)',
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
    helpWhatDesc: '<strong>GemMCP</strong> bridges Google Gemini Web directly to the external world using the Model Context Protocol (MCP), giving your AI assistant real tools and automation:',
    helpFeatWin: '💻 <strong>Windows MCP</strong> – Read/write local files, run PowerShell/CMD commands, and launch apps.',
    helpFeatSupa: '⚡ <strong>Supabase</strong> – Query SQL databases and manage backend records live.',
    helpFeatNotion: '<svg style="width:14px;height:14px;vertical-align:-2px;display:inline-block;" viewBox="0 0 122 122" fill="none"><path d="M6 12.5 74.5 7.5c8.4-.7 10.6-.2 15.9 3.6l21.9 15.4c3.6 2.6 4.8 3.3 4.8 6.2v83.4c0 5.3-1.9 8.4-8.6 8.9l-79.5 4.8c-5.1.2-7.5-.5-10.2-3.8L4.7 105.9C1.8 102 .6 99.1.6 95.7V21.4C.6 17.1 2.5 13.5 6 12.5Z" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M74.5 7.5 6 12.5C2.5 13.5.6 17.1.6 21.4v74.3c0 3.4 1.2 6.3 4.1 10.2l14.1 18.3c2.7 3.3 5.1 4 10.2 3.8l79.5-4.8c6.7-.5 8.6-3.6 8.6-8.9V32.7c0-2.7-1.1-3.5-4.3-5.8l-.5-.4-21.9-15.4c-5.3-3.8-7.5-4.3-15.9-3.6ZM31 24.4c-6.5.4-8 .5-11.7-2.5L9.9 14.4c-1-1-.5-2.2.9-2.4l65.9-4.8c5.5-.5 8.4 1.4 10.6 3.1l11.4 8.2c.3.2 1.1 1.2.1 1.2l-68 4.1-.2.1ZM23.4 111V39.3c0-3.1 1-4.6 3.9-4.8l78-4.6c2.7-.2 3.9 1.5 3.9 4.6v71.2c0 3.1-.5 5.8-4.8 6l-74.6 4.3c-4.3.2-6.4-1.2-6.4-5Zm73.7-68c.5 2.2 0 4.3-2.2 4.6l-3.6.7v52.8c-3.1 1.7-6 2.7-8.4 2.7-3.9 0-4.8-1.2-7.7-4.8L51.5 61.9v35.9l7.5 1.7s0 4.3-6 4.3l-16.6 1c-.5-1 0-3.4 1.7-3.9l4.3-1.2V50.5l-6-.5c-.5-2.2.7-5.3 4.1-5.5l17.8-1.2 24.5 37.5V47.6l-6.3-.7c-.5-2.7 1.4-4.6 3.9-4.8l17-1Z" fill="#000000"/></svg> <strong>Notion</strong> – Search, read, and create Notion pages, docs, and tasks.',
    helpFeatGit: '<svg style="width:14px;height:14px;vertical-align:-2px;display:inline-block;" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg> <strong>GitHub</strong> – Browse code repositories, fetch files, and manage issues.',
    helpFeatFetch: '🌐 <strong>Web Scraper</strong> – Live webpage crawling and authenticated tab scraping.',
    helpFeatCustom: '🧩 <strong>Custom MCP Servers</strong> – Connect any custom local or remote MCP SSE server.',
    helpHowTitle: 'How to use? (3 Simple Steps)',
    helpStep1Title: 'Connect & Enable Services:',
    helpStep1Desc: 'In this popup, click to connect your services (1-click OAuth or manual keys) and toggle their switches ON. Changes are saved automatically in real time.',
    helpStep2Title: 'Open Google Gemini:',
    helpStep2Desc: 'Go to <a href="https://gemini.google.com" target="_blank" class="help-link">gemini.google.com ↗</a>. You will see the floating GemMCP widget.',
    helpStep3Title: 'Activate & Prompt freely:',
    helpStep3Desc: 'Click <strong>"Activate GemMCP"</strong> on the widget to inject prompts (or type <code>@GemMCP</code>). Ask Gemini for any task (e.g. <em>"Create an index.html file on my desktop"</em> or <em>"List my Supabase tables"</em>).',
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
