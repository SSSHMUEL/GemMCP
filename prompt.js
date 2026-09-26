/**
 * GemMCP - Dynamic System Prompt Generator
 * בונה פרומפט מערכת מותאם אישית לפי השירותים הפעילים של המשתמש.
 * משמש את שלושת האתרים הנתמכים: Gemini, Claude ו-ChatGPT.
 * כולל תמיכה בפרומפטים מותאמים אישית לכל כלי ואפשרות איפוס לברירת מחדל
 */

const OMNI_MCP_REGISTRY = {
  supabase: {
    id: 'supabase',
    name: 'Supabase Database (מסד נתונים ו-SQL)',
    icon: '⚡',
    description: 'הפקת פקודות מסד נתונים בפורמט JSON להרצה עצמאית (שליפת טבלאות, סכמות, שאילתות SQL).',
    userIntentMapping: 'כל בקשה שקשורה ל: "טבלאות", "איזה טבלאות יש לי", "נתונים", "בסיס נתונים", "DB", "רשומות", "משתמשים", "סופה בייס", "Supabase", "SQL", "שאילתה", "שדות", "סכמה" - החזר פקודת JSON עבור שירות supabase.',
    schema: {
      action: 'execute_sql | list_tables | get_schema',
      query: 'שאילתת ה-SQL להרצה'
    }
,
    examples: [
      '{"service": "supabase", "action": "execute_sql", "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';"}'
    ]
  },
  notion: {
    id: 'notion',
    name: 'Notion Workspace (פתקים, מסמכים, רשימות ומשימות)',
    icon: '📝',
    description: 'הפקת פקודות בפורמט JSON עבור Notion (חיפוש פתקים ודפים, קריאת תוכן, יצירת פתקים ומשימות).',
    userIntentMapping: 'כל בקשה שקשורה ל: "פתקים", "איזה פתקים יש לי", "נושן", "Notion", "רשימות", "דפים", "משימות", "מסמכים", "תזכורות", "הערות" - החזר פקודת JSON עבור שירות notion.',
    schema: {
      action: 'search | get_page | create_page',
      query: 'טקסט לחיפוש ב-Notion (מחרוזת ריקה מחזירה את כל הדפים האחרונים)',
      page_id: 'מזהה הדף לקריאה מלאה'
    }
,
    examples: [
      '{"service": "notion", "action": "search", "query": ""}',
      '{"service": "notion", "action": "get_page", "page_id": "PAGE_ID"}'
    ]
  },
  browser: {
    id: 'browser',
    name: 'Browser Tools (צילום מסך)',
    icon: '📸',
    description: 'מאפשר לצלם את המסך של הכרטיסייה הפעילה בדפדפן (Screenshot).',
    userIntentMapping: 'אם המשתמש מבקש: "צלם מסך", "איך נראה הדף", "screenshot" - פלוט פקודת JSON עבור שירות browser.',
    schema: {
      action: 'take_screenshot'
    }
,
    examples: [
      '{"service": "browser", "action": "take_screenshot"}'
    ]
  }
,
  scheduler: {
    id: 'scheduler',
    name: 'מנהל תזמונים (Task Scheduler)',
    icon: '⏳',
    description: 'מאפשר לך לבקש מהמערכת להעיר אותך בעוד זמן מוגדר על ידי הזרקת פרומפט חדש.',
    userIntentMapping: 'אם המשתמש מבקש: "תזכיר לי", "תבדוק שוב בעוד X", "schedule" - השתמש בשירות scheduler.',
    schema: {
      action: 'schedule_prompt',
      delay_minutes: 'מספר הדקות להמתנה',
      prompt_text: 'הטקסט שיוזרק לשיחה לאחר ההמתנה'
    }
,
    examples: [
      '{"service": "scheduler", "action": "schedule_prompt", "delay_minutes": 5, "prompt_text": "בדוק שוב אם שרת ה-SQL חזר להיות זמין"}'
    ]
  }
,
  search: {
    id: 'search',
    name: 'Web Search (חיפוש מתקדם ברשת)',
    icon: '🔍',
    description: 'מבצע חיפוש ברשת האינטרנט ומחזיר כותרות וקישורים עדכניים.',
    userIntentMapping: 'אם המשתמש מבקש "חפש ברשת", "מה החדשות", או מידע שאין לך - השתמש ב-search.',
    schema: {
      action: 'search_web',
      query: 'מילת החיפוש'
    }
,
    examples: [
      '{"service": "search", "action": "search_web", "query": "מזג אוויר בתל אביב"}'
    ]
  },
  interact: {
    id: 'interact',
    name: 'Browser Interact (שליטה במסך)',
    icon: '🖱️',
    description: 'מאפשר הקראה קולית, גלילה של הדף הנוכחי, והדגשת טקסט במסך.',
    userIntentMapping: 'אם מבקשים "תקריא לי", "תגלול למטה", "תדגיש את המילה" - השתמש ב-interact.',
    schema: {
      action: 'speak | scroll | highlight',
      text: 'טקסט להקראה או להדגשה (אופציונלי)',
      direction: 'לגלילה: "up" או "down" (אופציונלי)'
    }
,
    examples: [
      '{"service": "interact", "action": "speak", "text": "בוקר טוב!"}',
      '{"service": "interact", "action": "scroll", "direction": "down"}'
    ]
  },
  windows_extra: {
    id: 'windows_extra',
    name: 'Windows Control (מדיה וחלונות)',
    icon: '🎛️',
    description: 'שליטה בווליום, מוזיקה, והקפצה/סגירה של חלונות בווינדוס.',
    userIntentMapping: 'אם המשתמש מבקש: "תשתיק את המחשב", "תעביר שיר", "תקפיץ את וורד", "מה פתוח" - השתמש ב-windows_extra.',
    schema: {
      action: 'media_control | manage_windows',
      command: 'למדיה: "mute", "unmute", "vol_up", "vol_down", "play_pause", "next". לחלונות: "list", "focus", "close"',
      app_name: 'רק עבור focus או close: שם התוכנה'
    }
,
    examples: [
      '{"service": "windows_extra", "action": "media_control", "command": "mute"}',
      '{"service": "windows_extra", "action": "manage_windows", "command": "focus", "app_name": "notepad"}'
    ]
  },
  windows: {
    id: 'windows',
    name: 'Windows OS Tools (פקודות מערכת וקבצים)',
    icon: '🪟',
    description: 'הפקת פקודות בפורמט JSON להרצה עצמאית במחשב: הפעלת תוכנות (קלוד, VS Code, מחשבון, כרום, ספוטיפיי, ווטסאפ, טלגרם, פנקס רשימות, וורד, אקסל), קריאה וכתיבת קבצים, חיפוש לפי תבנית, יצירת תיקייה, העתקה, העברה ומחיקה לסל המיחזור, סריקת תיקיות, הרצת פקודות PowerShell ולוח ההעתקה. למשימה מרובת שלבים יש להשתמש בשדה plan.',
    userIntentMapping: 'כל בקשה לפתיחת תוכנה או אפליקציה (למשל: "פתח מחשבון", "תפתח את קלוד", "פתח VS Code"), קריאת/כתיבת קבצים, סריקת תיקיות, שימוש ב-Clipboard או פקודות מערכת - החזר ישירות פקודת JSON עבור שירות windows.',
    schema: {
      action: 'open_app | read_file | write_file | list_directory | find_files | make_dir | copy_file | move_file | delete_file | run_command | clipboard_read | clipboard_write | github_cli',
      app_name: 'claude | vscode | code | calc | notepad | chrome | spotify | whatsapp | telegram | word | excel | explorer',
      path: 'נתיב מלא לקובץ או תיקייה במחשב',
      content: 'תוכן טקסט לכתיבה לקובץ',
      command: 'פקודת PowerShell להרצה',
      text: 'טקסט להעתקה ללוח'
    }
,
    examples: [
      '{"service": "windows", "action": "open_app", "app_name": "calc"}',
      '{"service": "windows", "action": "find_files", "path": "~/Downloads", "pattern": "*.pdf", "limit": 50}',
      '{"service": "windows", "action": "list_directory", "path": "~/Desktop", "offset": 0, "limit": 200}',
      '{"service": "windows", "plan": [{"action": "find_files", "path": "~/Downloads", "pattern": "*.pdf", "as": "pdfs"}, {"action": "make_dir", "path": "~/Downloads/PDF"}, {"action": "move_file", "from": "$pdfs.items[0].path", "to": "~/Downloads/PDF"}]}',
      '{"service": "windows", "action": "open_app", "app_name": "claude"}',
      '{"service": "windows", "action": "read_file", "path": "C:\\\\Users\\\\path\\\\file.txt"}',
      '{"service": "windows", "action": "list_directory", "path": "C:\\\\Users\\\\path"}',
      '{"service": "windows", "action": "clipboard_read"}'
    ]
  },
  github: {
    id: 'github',
    name: 'GitHub Integration (ניהול קוד ומאגרים)',
    icon: '🐙',
    description: 'הפקת פקודות בפורמט JSON עבור GitHub (יצירת מאגרים, משיכת רשימת ריפו, קריאת קוד מקור, יצירת Issues).',
    userIntentMapping: 'כל בקשה שקשורה ל: "גיטהאב", "GitHub", "ריפו", "צור ריפו", "מחק ריפו", "מאגרים", "קוד מקור", "קרא קובץ מגיטהאב", "העלה קובץ", "קומיטים", "ברנצ\'ים", "Issue", "Pull Request", "PR" - החזר פקודת JSON עבור שירות github.',
    schema: {
      action: 'list_repos | get_file | create_issue | create_repo',
      repo: 'owner/repo_name',
      name: 'שם המאגר החדש ליצירה (ב-create_repo)',
      description: 'תיאור המאגר (אופציונלי)',
      private: 'true / false (האם המאגר פרטי)',
      path: 'נתיב הקובץ במאגר'
    }
,
    examples: [
      '{"service": "github", "action": "create_repo", "name": "my-new-app", "description": "My project", "private": true}',
      '{"service": "github", "action": "list_repos"}',
      '{"service": "github", "action": "get_file", "repo": "owner/repo", "path": "package.json"}'
    ]
  },
  fetch: {
    id: 'fetch',
    name: 'Web Fetch (סריקת אתרים וקישורים)',
    icon: '🌐',
    description: 'הפקת פקודת JSON לקריאת כתובת אינטרנט.',
    userIntentMapping: 'כל בקשה שכוללת קישור לאתר (URL), בקשת קריאת דף או סריקת אתר - החזר פקודת JSON עבור שירות fetch.',
    schema: {
      action: 'get_url',
      url: 'כתובת ה-URL המלאה לקריאה'
    }
,
    examples: [
      '{"service": "fetch", "action": "get_url", "url": "https://example.com"}'
    ]
  },
  custom: {
    id: 'custom',
    name: 'Custom MCP Server',
    icon: '🔌',
    description: 'הפקת פקודות בפורמט JSON עבור שרת מותאם אישית.',
    userIntentMapping: 'כל בקשה המשתמשת בכלי מותאם ייעודי.',
    schema: {
      action: 'custom:call_tool',
      tool_name: 'שם הכלי',
      arguments: {}
    }
,
    examples: [
      '{"service": "custom", "tool_name": "my_tool", "arguments": {}}'
    ]
  }
};

/**
 * פרומפטי ברירת מחדל עבור כל כלי (הסבר מלא + דוגמאות מפורטות)
 */
// רשימת הפעולות של Windows הופיעה קודם פעמיים, מילה במילה, ובשתיהן היו חסרות
// make_dir, copy_file, move_file, delete_file ו-find_files. מקור אחד כדי שלא
// יסטו שוב, ובו גם ההנחיה להעדיף פעולה ייעודית על פני PowerShell.
const WINDOWS_TOOL_LINES = `Format response strictly as a JSON object for Windows OS:
- read_file:      {"service": "windows", "action": "read_file", "path": "<path>"}
- write_file:     {"service": "windows", "action": "write_file", "path": "<path>", "content": "<text>"}
- list_directory: {"service": "windows", "action": "list_directory", "path": "<e.g. ~/Downloads, ~/Desktop>"}
- find_files:     {"service": "windows", "action": "find_files", "path": "<dir>", "pattern": "*.pdf"}
- make_dir:       {"service": "windows", "action": "make_dir", "path": "<path>"}
- copy_file:      {"service": "windows", "action": "copy_file", "from": "<path>", "to": "<path>"}
- move_file:      {"service": "windows", "action": "move_file", "from": "<path>", "to": "<path>"}
- delete_file:    {"service": "windows", "action": "delete_file", "path": "<path>"}   (Recycle Bin; add "recursive": true for a non-empty folder)
- open_app:       {"service": "windows", "action": "open_app", "app_name": "<name>"}
                  אם התשובה מכילה candidates, התוכנה מותקנת אך יש כמה התאמות.
                  הצג אותן למשתמש וקרא שוב עם "path" של זו שבחר, לא עם app_name.
- github_cli:     {"service": "windows", "action": "github_cli", "args": ["repo", "list"]}
                  GitHub דרך ה-gh שכבר מחובר במחשב - בלי טוקן נפרד, ועם ההרשאות
                  המלאות של המשתמש. args הוא מערך, לא מחרוזת אחת.
                  מותר: auth, repo, pr, issue, release, run, workflow, gist, label,
                  api, search, browse, status, org, ruleset. api מוגבל ל-GET.
                  דוגמאות: ["repo","view","owner/name","--json","name,visibility"]
                           ["pr","list","--limit","5"]  ["release","list"]
- clipboard_read: {"service": "windows", "action": "clipboard_read"}
- clipboard_write:{"service": "windows", "action": "clipboard_write", "text": "<text>"}
- download_file:  {"service": "windows", "action": "download_file", "url": "<https url>", "filename": "<optional>"}
- install_from_url: {"service": "windows", "action": "install_from_url", "url": "<https url to .exe or .msi>"}   (always asks; cancellable)
- media_control:  {"service": "windows", "action": "media_control", "command": "play_pause|next|prev|vol_up|vol_down|mute"}
- manage_windows: {"service": "windows", "action": "manage_windows", "command": "list"}   (or "focus" with "app_name")
- run_command:    {"service": "windows", "action": "run_command", "command": "<powershell_command>"}

PREFER a dedicated action over run_command. Use run_command ONLY when nothing
above fits: it is disabled by default and is the one permission the allowed-folder
limit cannot contain. Create a folder with make_dir, not New-Item. Move or delete
with move_file / delete_file, not PowerShell.`;

const OMNI_DEFAULT_TOOL_PROMPTS = {
  windows: WINDOWS_TOOL_LINES,

  supabase: `Format response strictly as a JSON object for Supabase:
- execute_sql: {"service": "supabase", "action": "execute_sql", "query": "<SQL query based on request>"}`,

  notion: `Format response strictly as a JSON object for Notion:
- search: {"service": "notion", "action": "search", "query": "<search_term or empty>"}
- get_page: {"service": "notion", "action": "get_page", "page_id": "<page_id>"}
- create_page: {"service": "notion", "action": "create_page", "title": "<title>", "content": "<content>"}`,

  github: `Format response strictly as a JSON object for GitHub:
- list_repos:            {"service": "github", "action": "list_repos"}
- get_repo:              {"service": "github", "action": "get_repo", "repo": "<owner/repo>"}
- get_file:              {"service": "github", "action": "get_file", "repo": "<owner/repo>", "path": "<path>", "branch": "main"}
- create_or_update_file: {"service": "github", "action": "create_or_update_file", "repo": "<owner/repo>", "path": "<path>", "content": "<text>", "message": "<commit msg>"}
- delete_repo_file:      {"service": "github", "action": "delete_repo_file", "repo": "<owner/repo>", "path": "<path>"}
- list_commits:          {"service": "github", "action": "list_commits", "repo": "<owner/repo>"}
- list_branches:         {"service": "github", "action": "list_branches", "repo": "<owner/repo>"}
- list_issues:           {"service": "github", "action": "list_issues", "repo": "<owner/repo>", "state": "open"}
- create_issue:          {"service": "github", "action": "create_issue", "repo": "<owner/repo>", "title": "<title>", "body": "<body>"}
- comment_issue:         {"service": "github", "action": "comment_issue", "repo": "<owner/repo>", "number": 1, "body": "<text>"}
- close_issue:           {"service": "github", "action": "close_issue", "repo": "<owner/repo>", "number": 1}
- list_prs:              {"service": "github", "action": "list_prs", "repo": "<owner/repo>", "state": "open"}
- create_pull_request:   {"service": "github", "action": "create_pull_request", "repo": "<owner/repo>", "title": "<t>", "head": "<branch>", "base": "main"}
- create_repo:           {"service": "github", "action": "create_repo", "name": "<name>", "private": false}
- delete_repo:           {"service": "github", "action": "delete_repo", "repo": "<owner/repo>"}

לפעולות שהטוקן אינו מורשה להן - מחיקת מאגר היא המקרה הרגיל - יש מסלול שני
דרך ה-gh שכבר מחובר במחשב, עם ההרשאות המלאות של המשתמש:
  {"service": "windows", "action": "github_cli", "args": ["repo", "delete", "owner/name", "--yes"]}`,

  fetch: `Format response strictly as a JSON object for Web Fetch:
- get_url: {"service": "fetch", "action": "get_url", "url": "<url>"}`
};

const OMNI_DEFAULT_TOOL_PROMPTS_EN = { ...OMNI_DEFAULT_TOOL_PROMPTS };

function getDefaultPrompt(serviceId, lang = 'he') {
  const isEn = lang === 'en' || (typeof window !== 'undefined' && window.__gemmcp_current_lang === 'en');
  if (isEn && OMNI_DEFAULT_TOOL_PROMPTS_EN[serviceId]) {
    return OMNI_DEFAULT_TOOL_PROMPTS_EN[serviceId];
  }
  return OMNI_DEFAULT_TOOL_PROMPTS[serviceId] || '';
}

function getAllDefaultPrompts(lang = 'he') {
  const isEn = lang === 'en' || (typeof window !== 'undefined' && window.__gemmcp_current_lang === 'en');
  return isEn ? { ...OMNI_DEFAULT_TOOL_PROMPTS_EN } : { ...OMNI_DEFAULT_TOOL_PROMPTS };
}

function generateOmniSystemPrompt(activeServices = ['supabase', 'notion', 'fetch', 'windows'], customServers = [], customToolPrompts = {}) {
  const toolSchemas = [];

  if (activeServices.includes('windows')) {
    // הרשימה כאן היא כל מה שהמודל יודע עליו. קודם היא פרסמה run_command אבל
    // השמיטה את make_dir, copy_file, move_file, delete_file, find_files ואת
    // התוכניות - כך שכשהתבקש ליצור תיקייה, PowerShell היה הכלי היחיד שהוא ראה.
    //
    // זו לולאה רעה: run_command היא ההרשאה היחידה שגבול התיקייה אינו כולא,
    // והיא כבויה כברירת מחדל. הפעולה נכשלת, והתיקון הטבעי של המשתמש הוא
    // להדליק בדיוק את ההרשאה המסוכנת ביותר - בשביל משימה שפעולה ייעודית
    // הייתה מבצעת בתוך התחום המותר.
    toolSchemas.push(`- Windows OS (service: "windows"):
  Files:     read_file, write_file, list_directory, find_files
  Managing:  make_dir, copy_file, move_file, delete_file
  Other:     open_app, clipboard_read, clipboard_write, run_command, github_cli
  System:    media_control, manage_windows
  Internet:  download_file, install_from_url
  PREFER the dedicated action over run_command. Use run_command ONLY when no
  dedicated action fits - it is disabled by default and is the one permission
  the allowed-folder limit cannot contain. To create a folder use make_dir,
  not New-Item. To move or delete, use move_file / delete_file, not PowerShell.
  delete_file goes to the Recycle Bin; add "recursive": true for a non-empty folder.
  Example: {"service": "windows", "action": "make_dir", "path": "~/Desktop/Reports"}
  Example: {"service": "windows", "action": "find_files", "path": "~/Desktop", "pattern": "*.pdf"}
  Example: {"service": "windows", "action": "list_directory", "path": "~/Downloads"}
  Example: {"service": "windows", "action": "media_control", "command": "play_pause"}
  Example: {"service": "windows", "action": "manage_windows", "command": "list"}
  Example: {"service": "windows", "action": "download_file", "url": "https://example.com/a.pdf"}

  For a task needing several steps, send ONE plan instead of separate commands.
  Name a step with "as", then reference it as $name, $name.field or $name[i].
  A plan always asks the user once, rather than once per step.
  Example: {"service": "windows", "plan": [
    {"action": "find_files", "path": "~/Desktop", "pattern": "*.pdf", "as": "pdfs"},
    {"action": "make_dir", "path": "~/Desktop/PDF"},
    {"action": "move_file", "from": "$pdfs.items[0].path", "to": "~/Desktop/PDF"}
  ]}
  References are not allowed inside a run_command command string.`);
  }

  if (activeServices.includes('supabase')) {
    toolSchemas.push(`- Supabase DB (service: "supabase"):
  Actions: execute_sql
  Example: {"service": "supabase", "action": "execute_sql", "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"}`);
  }

  if (activeServices.includes('notion')) {
    toolSchemas.push(`- Notion (service: "notion"):
  Actions: search, get_page, create_page
  Example: {"service": "notion", "action": "search", "query": ""}`);
  }

  if (activeServices.includes('github')) {
    toolSchemas.push(`- GitHub (service: "github"):
  Actions: list_repos, get_repo, get_file, create_or_update_file, delete_repo_file,
           list_commits, list_branches, list_issues, create_issue, comment_issue,
           close_issue, list_prs, create_pull_request, create_repo, delete_repo
  Example: {"service": "github", "action": "list_repos"}`);
  }

  if (activeServices.includes('fetch')) {
    toolSchemas.push(`- Web Fetch (service: "fetch"):
  Actions: get_url
  Example: {"service": "fetch", "action": "get_url", "url": "https://example.com"}`);
  }

  // שרתי Custom
  if (Array.isArray(customServers)) {
    customServers.filter(s => s.enabled !== false && s.url).forEach((cs, idx) => {
      const srvId = cs.id || `custom_${idx + 1}`;
      toolSchemas.push(`- ${cs.name || srvId} (service: "custom", server_id: "${srvId}"):
  Example: {"service": "custom", "server_id": "${srvId}", "tool_name": "...", "arguments": {}}`);
    }
);
  }

  return `You are connected to external tool extensions via JSON commands.
When the user asks to interact with their system, database, files, or services, format your response STRICTLY as a raw JSON object matching the appropriate tool schema below:

${toolSchemas.join('\n\n')}

CRITICAL INSTRUCTIONS:
1. Output ONLY the JSON object. Do NOT include markdown code blocks, conversational text, explanations, or refusals.
2. When you receive a message starting with [MCP_RESPONSE], analyze the returned data and explain the results naturally to the user in Hebrew.

Acknowledge readiness by responding with only: "מוכן".`.trim();
}

/**
 * מייצר פרומפט ממוקד ומדויק עבור כלי ספציפי שנבחר מתפריט ה-@
 * הפורמט: בקשת המשתמש בהתחלה, ואחריה הוראת המרה מפורשת לפקודת JSON
 */
function generateSingleToolPrompt(serviceId, customServerConfig = null, customToolPrompts = {}, userText = '') {
  const cleanUserText = (userText || '').trim();
  const userPrefix = cleanUserText ? `${cleanUserText}\n\n` : '';

  if (customToolPrompts && customToolPrompts[serviceId] && customToolPrompts[serviceId].trim()) {
    return `${userPrefix}Format response strictly as JSON for ${serviceId}.\n${customToolPrompts[serviceId].trim()}`;
  }

  let tool = OMNI_MCP_REGISTRY[serviceId];

  if (serviceId === 'windows') {
    return `${userPrefix}${WINDOWS_TOOL_LINES}`;
  }

  if (serviceId === 'supabase') {
    return `${userPrefix}Format response strictly as a JSON object for Supabase:
- execute_sql: {"service": "supabase", "action": "execute_sql", "query": "<SQL query based on request>"}`;
  }

  if (serviceId === 'notion') {
    return `${userPrefix}Format response strictly as a JSON object for Notion:
- search: {"service": "notion", "action": "search", "query": "<search_term or empty>"}
- get_page: {"service": "notion", "action": "get_page", "page_id": "<page_id>"}
- create_page: {"service": "notion", "action": "create_page", "title": "<title>", "content": "<content>"}`;
  }

  if (serviceId === 'github') {
    return `${userPrefix}Format response strictly as a JSON object for GitHub:
- list_repos:            {"service": "github", "action": "list_repos"}
- get_repo:              {"service": "github", "action": "get_repo", "repo": "<owner/repo>"}
- get_file:              {"service": "github", "action": "get_file", "repo": "<owner/repo>", "path": "<path>", "branch": "main"}
- create_or_update_file: {"service": "github", "action": "create_or_update_file", "repo": "<owner/repo>", "path": "<path>", "content": "<text>", "message": "<commit msg>"}
- delete_repo_file:      {"service": "github", "action": "delete_repo_file", "repo": "<owner/repo>", "path": "<path>"}
- list_commits:          {"service": "github", "action": "list_commits", "repo": "<owner/repo>"}
- list_branches:         {"service": "github", "action": "list_branches", "repo": "<owner/repo>"}
- list_issues:           {"service": "github", "action": "list_issues", "repo": "<owner/repo>", "state": "open"}
- create_issue:          {"service": "github", "action": "create_issue", "repo": "<owner/repo>", "title": "<title>", "body": "<body>"}
- comment_issue:         {"service": "github", "action": "comment_issue", "repo": "<owner/repo>", "number": 1, "body": "<text>"}
- close_issue:           {"service": "github", "action": "close_issue", "repo": "<owner/repo>", "number": 1}
- list_prs:              {"service": "github", "action": "list_prs", "repo": "<owner/repo>", "state": "open"}
- create_pull_request:   {"service": "github", "action": "create_pull_request", "repo": "<owner/repo>", "title": "<t>", "head": "<branch>", "base": "main"}
- create_repo:           {"service": "github", "action": "create_repo", "name": "<name>", "private": false}
- delete_repo:           {"service": "github", "action": "delete_repo", "repo": "<owner/repo>"}

לפעולות שהטוקן אינו מורשה להן - מחיקת מאגר היא המקרה הרגיל - יש מסלול שני
דרך ה-gh שכבר מחובר במחשב, עם ההרשאות המלאות של המשתמש:
  {"service": "windows", "action": "github_cli", "args": ["repo", "delete", "owner/name", "--yes"]}`;
  }

  if (serviceId === 'fetch') {
    return `${userPrefix}Format response strictly as a JSON object for Web Fetch:
- get_url: {"service": "fetch", "action": "get_url", "url": "<url>"}`;
  }

  if (customServerConfig || serviceId === 'custom' || (typeof serviceId === 'string' && serviceId.startsWith('custom_'))) {
    const cs = customServerConfig || {};
    const srvId = cs.id || serviceId || 'custom';
    const exampleCall = cs.exampleCall || `{"service": "custom", "server_id": "${srvId}", "tool_name": "example_tool", "arguments": {}}`;

    return `${userPrefix}Format response strictly as JSON: ${exampleCall}`;
  }

  const exampleStr = tool && tool.examples ? tool.examples[0] : `{"service": "${serviceId}"}`;
  return `${userPrefix}Format response strictly as JSON: ${exampleStr}`;
}






