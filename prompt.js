/**
 * GemMCP - Dynamic System Prompt Generator
 * בונה פרומפט מערכת מותאם אישית לג'מיני לפי השירותים הפעילים של המשתמש
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
    },
    examples: [
      '{"service": "supabase", "action": "execute_sql", "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';"}'
    ]
  },
  notion: {
    id: 'notion',
    name: 'Notion Workspace (ניהול ידע ומשימות)',
    icon: 'notion',
    description: 'הפקת פקודות בפורמט JSON עבור Notion (חיפוש, קריאת דפים, יצירת דפים ומשימות חדשות).',
    userIntentMapping: 'כל בקשה שקשורה ל: "פתקים", "איזה פתקים יש לי", "נושן", "Notion", "רשימות", "דפים", "משימות", "מסמכים", "תזכורות", "הערות" - החזר פקודת JSON עבור שירות notion.',
    schema: {
      action: 'search | get_page | create_page',
      query: 'טקסט לחיפוש ב-Notion (מחרוזת ריקה מחזירה את כל הדפים האחרונים)',
      page_id: 'מזהה הדף לקריאה מלאה'
    },
    examples: [
      '{"service": "notion", "action": "search", "query": ""}',
      '{"service": "notion", "action": "get_page", "page_id": "PAGE_ID"}'
    ]
  },
  windows: {
    id: 'windows',
    name: 'Windows OS Tools (פקודות מערכת וקבצים)',
    icon: '🪟',
    description: 'הפקת פקודות בפורמט JSON להרצה עצמאית במחשב: הפעלת תוכנות (קלוד, VS Code, מחשבון, כרום, ספוטיפיי, ווטסאפ, טלגרם, פנקס רשימות, וורד, אקסל), קריאה וכתיבת קבצים, סריקת תיקיות, הרצת פקודות PowerShell ולוח ההעתקה.',
    userIntentMapping: 'כל בקשה לפתיחת תוכנה או אפליקציה (למשל: "פתח מחשבון", "תפתח את קלוד", "פתח VS Code"), קריאת/כתיבת קבצים, סריקת תיקיות, שימוש ב-Clipboard או פקודות מערכת - החזר ישירות פקודת JSON עבור שירות windows.',
    schema: {
      action: 'open_app | read_file | write_file | list_directory | run_command | clipboard_read | clipboard_write',
      app_name: 'claude | vscode | code | calc | notepad | chrome | spotify | whatsapp | telegram | word | excel | explorer',
      path: 'נתיב מלא לקובץ או תיקייה במחשב',
      content: 'תוכן טקסט לכתיבה לקובץ',
      command: 'פקודת PowerShell להרצה',
      text: 'טקסט להעתקה ללוח'
    },
    examples: [
      '{"service": "windows", "action": "open_app", "app_name": "calc"}',
      '{"service": "windows", "action": "open_app", "app_name": "claude"}',
      '{"service": "windows", "action": "read_file", "path": "C:\\\\Users\\\\path\\\\file.txt"}',
      '{"service": "windows", "action": "list_directory", "path": "C:\\\\Users\\\\path"}',
      '{"service": "windows", "action": "clipboard_read"}'
    ]
  },
  github: {
    id: 'github',
    name: 'GitHub Integration (ניהול קוד ומאגרים)',
    icon: 'github',
    description: 'הפקת פקודות בפורמט JSON עבור GitHub (יצירת מאגרים, משיכת רשימת ריפו, קריאת קוד מקור, יצירת Issues).',
    userIntentMapping: 'כל בקשה שקשורה ל: "גיטהאב", "GitHub", "ריפו", "צור ריפו", "מאגרים", "קוד מקור", "קרא קובץ מגיטהאב", "Issue" - החזר פקודת JSON עבור שירות github.',
    schema: {
      action: 'list_repos | get_file | create_issue | create_repo',
      repo: 'owner/repo_name',
      name: 'שם המאגר החדש ליצירה (ב-create_repo)',
      description: 'תיאור המאגר (אופציונלי)',
      private: 'true / false (האם המאגר פרטי)',
      path: 'נתיב הקובץ במאגר'
    },
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
    },
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
    },
    examples: [
      '{"service": "custom", "tool_name": "my_tool", "arguments": {}}'
    ]
  }
};

/**
 * פרומפטי ברירת מחדל עבור כל כלי (הסבר מלא + דוגמאות מפורטות)
 */
const OMNI_DEFAULT_TOOL_PROMPTS = {
  windows: `Format response strictly as a JSON object for Windows OS:
- open_app: {"service": "windows", "action": "open_app", "app_name": "<name>"}
- list_directory: {"service": "windows", "action": "list_directory", "path": "<path e.g. ~/Downloads, ~/Desktop, C:\\...>"}
- read_file: {"service": "windows", "action": "read_file", "path": "<path>"}
- write_file: {"service": "windows", "action": "write_file", "path": "<path>", "content": "<text>"}
- run_command: {"service": "windows", "action": "run_command", "command": "<powershell_command>"}
- clipboard_read: {"service": "windows", "action": "clipboard_read"}
- clipboard_write: {"service": "windows", "action": "clipboard_write", "text": "<text>"}`,

  supabase: `Format response strictly as a JSON object for Supabase:
- execute_sql: {"service": "supabase", "action": "execute_sql", "query": "<SQL query based on request>"}`,

  notion: `Format response strictly as a JSON object for Notion:
- search: {"service": "notion", "action": "search", "query": "<search_term or empty>"}
- get_page: {"service": "notion", "action": "get_page", "page_id": "<page_id>"}
- create_page: {"service": "notion", "action": "create_page", "title": "<title>", "content": "<content>"}`,

  github: `Format response strictly as a JSON object for GitHub:
- list_repos: {"service": "github", "action": "list_repos"}
- get_file: {"service": "github", "action": "get_file", "repo": "<owner/repo>", "path": "<path>"}
- create_repo: {"service": "github", "action": "create_repo", "name": "<name>", "private": false}
- create_issue: {"service": "github", "action": "create_issue", "repo": "<repo>", "title": "<title>", "body": "<body>"}`,

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
    toolSchemas.push(`- Windows OS (service: "windows"):
  Actions: open_app, list_directory, read_file, write_file, run_command, clipboard_read, clipboard_write
  Example: {"service": "windows", "action": "open_app", "app_name": "calc"}
  Example: {"service": "windows", "action": "list_directory", "path": "~/Downloads"}`);
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
  Actions: list_repos, get_file, create_repo, create_issue
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
    });
  }

  return `You are connected to external tool extensions via JSON commands.
When the user asks to interact with their system, database, files, or services, format your response STRICTLY as a raw JSON object matching the appropriate tool schema below:

${toolSchemas.join('\n\n')}

CRITICAL INSTRUCTIONS:
1. Output ONLY the JSON object. Do NOT include markdown code blocks, conversational text, explanations, or refusals.
2. When you receive a message starting with [MCP_RESPONSE], DO NOT output any JSON tool call. Analyze the returned data and explain the results naturally to the user in Hebrew.

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
    return `${userPrefix}Format response strictly as a JSON object for Windows OS:
- open_app: {"service": "windows", "action": "open_app", "app_name": "<name>"}
- list_directory: {"service": "windows", "action": "list_directory", "path": "<path e.g. ~/Downloads, ~/Desktop, C:\\...>"}
- read_file: {"service": "windows", "action": "read_file", "path": "<path>"}
- write_file: {"service": "windows", "action": "write_file", "path": "<path>", "content": "<text>"}
- run_command: {"service": "windows", "action": "run_command", "command": "<powershell_command>"}
- clipboard_read: {"service": "windows", "action": "clipboard_read"}
- clipboard_write: {"service": "windows", "action": "clipboard_write", "text": "<text>"}`;
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
- list_repos: {"service": "github", "action": "list_repos"}
- get_file: {"service": "github", "action": "get_file", "repo": "<owner/repo>", "path": "<path>"}
- create_repo: {"service": "github", "action": "create_repo", "name": "<name>", "private": false}
- create_issue: {"service": "github", "action": "create_issue", "repo": "<repo>", "title": "<title>", "body": "<body>"}`;
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



