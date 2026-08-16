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
    description: 'חיבור ישיר למסד הנתונים PostgreSQL של המשתמש ב-Supabase. מאפשר שליפת שמות טבלאות, בדיקת סכמות, ביצוע שאילתות SELECT, הוספה, עדכון ושליפת נתונים.',
    userIntentMapping: 'כל בקשה שקשורה ל: "טבלאות", "איזה טבלאות יש לי", "נתונים", "בסיס נתונים", "DB", "רשומות", "משתמשים", "סופה בייס", "Supabase", "SQL", "שאילתה", "שדות", "סכמה" - הכוונה היא למסד הנתונים Supabase המחובר!',
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
    name: 'Notion Workspace (פתקים, מסמכים, רשימות ומשימות)',
    icon: '📝',
    description: 'חיבור ישיר למרחב ה-Notion הפרטי של המשתמש. מאפשר חיפוש פתקים ודפים, קריאת תוכן של דפים ובלוקים, ויצירת פתקים ומשימות חדשים.',
    userIntentMapping: 'כל בקשה שקשורה ל: "פתקים", "איזה פתקים יש לי", "נושן", "Notion", "רשימות", "דפים", "משימות", "מסמכים", "תזכורות", "הערות", "טבלאות בנושן" - הכוונה היא אך ורק ל-Notion! אין להציע או להשתמש ב-Google Keep!',
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
    name: 'Windows OS Tools (שליטה מקומית במחשב)',
    icon: '🪟',
    description: 'שליטה ישירה ומלאה במחשב המקומי (Windows): הפעלת כל תוכנה/אפליקציה (קלוד, VS Code, מחשבון, כרום, ספוטיפיי, ווטסאפ, טלגרם, פנקס רשימות, וורד, אקסל), קריאה וכתיבת קבצים, צפייה בתיקיות, הרצת פקודות PowerShell, ושימוש בלוח ההעתקה (Clipboard).',
    userIntentMapping: 'כל בקשה לפתיחת תוכנה או אפליקציה (למשל: "תפתח את קלוד", "פתח מחשבון", "פתח VS Code", "פתח ספוטיפיי"), קריאת/כתיבת קבצים מקומיים, סריקת תיקיות, שימוש ב-Clipboard, או הרצת פקודות מערכת - שייכת לשירות windows!',
    schema: {
      action: 'open_app | read_file | write_file | list_directory | run_command | clipboard_read | clipboard_write',
      app_name: 'claude | vscode | code | calc | notepad | chrome | spotify | whatsapp | telegram | word | excel | explorer',
      path: 'נתיב מלא לקובץ או תיקייה במחשב',
      content: 'תוכן טקסט לכתיבה לקובץ',
      command: 'פקודת PowerShell להרצה',
      text: 'טקסט להעתקה ללוח'
    },
    examples: [
      '{"service": "windows", "action": "open_app", "app_name": "claude"}',
      '{"service": "windows", "action": "open_app", "app_name": "calc"}',
      '{"service": "windows", "action": "read_file", "path": "C:\\\\Users\\\\path\\\\file.txt"}',
      '{"service": "windows", "action": "list_directory", "path": "C:\\\\Users\\\\path"}',
      '{"service": "windows", "action": "clipboard_read"}'
    ]
  },
  github: {
    id: 'github',
    name: 'GitHub Integration (ניהול קוד ומאגרים)',
    icon: '🐙',
    description: 'חיבור לחשבון ה-GitHub של המשתמש. מאפשר משיכת רשימת מאגרים (Repositories), קריאת קבצי קוד מקור, ויצירת Issues/PRs.',
    userIntentMapping: 'כל בקשה שקשורה ל: "גיטהאב", "GitHub", "ריפו", "מאגרים", "קוד מקור", "קרא קובץ מגיטהאב", "Issue" - הכוונה היא לחיבור GitHub!',
    schema: {
      action: 'list_repos | get_file | create_issue',
      repo: 'owner/repo_name',
      path: 'נתיב הקובץ במאגר'
    },
    examples: [
      '{"service": "github", "action": "list_repos"}',
      '{"service": "github", "action": "get_file", "repo": "owner/repo", "path": "package.json"}'
    ]
  },
  fetch: {
    id: 'fetch',
    name: 'Web Fetch (סריקת אתרים וכרטיסיות)',
    icon: '🌐',
    description: 'סריקה וקריאה של כל כתובת אינטרנט (URL), כולל גישה ישירה לאתרים אישיים וכרטיסיות פתוחות שהמשתמש מחובר אליהן (עם סיסמה ו-Session). החזרת תוכן דפים חיים.',
    userIntentMapping: 'כל בקשה שכוללת קישור לאתר (URL), בקשת קריאת דף, סריקת אתר אישי או כרטיסייה פתוחה שהמשתמש מחובר אליה - שייכת לשירות fetch!',
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
    description: 'חיבור לשרת MCP מותאם אישית.',
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
  windows: `שליטה מקומית במחשב (Windows): הפעלת תוכנות, הרצת פקודות, קריאה וכתיבת קבצים, ניהול תיקיות ולוח העתקה.
כשמבקשים פעולה במחשב, אל תבצע בעצמך – המשתמש מריץ עצמאית. החזר ישירות בלוק JSON בפורמט המתאים:

פתיחת אפליקציה:
\`\`\`json
{"service": "windows", "action": "open_app", "app_name": "calc"}
\`\`\`

הרצת פקודת PowerShell:
\`\`\`json
{"service": "windows", "action": "run_command", "command": "Get-Process"}
\`\`\`

קריאת קובץ:
\`\`\`json
{"service": "windows", "action": "read_file", "path": "C:\\\\Users\\\\path\\\\file.txt"}
\`\`\`

סריקת תיקייה:
\`\`\`json
{"service": "windows", "action": "list_directory", "path": "C:\\\\Users\\\\path"}
\`\`\``,

  supabase: `מסד הנתונים PostgreSQL ב-Supabase: שליפת שמות טבלאות, בדיקת סכמות וביצוע שאילתות SQL.
כשמבקשים מידע על טבלאות, נתונים או שאילתות, אל תבצע בעצמך – המשתמש מריץ עצמאית. החזר ישירות בלוק JSON בפורמט המתאים:

שליפת רשימת טבלאות:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"}
\`\`\`

שליפת רשומות מטבלה:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT * FROM users LIMIT 10;"}
\`\`\`

בדיקת סכמת עמודות:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';"}
\`\`\``,

  notion: `מרחב Notion: חיפוש פתקים ודפים, קריאת תוכן מלא ויצירת משימות.
כשמבקשים מידע על פתקים, דפים, רשימות או Notion, אל תפנה ל-Google Keep או תנסה לחפש בעצמך. החזר ישירות בלוק JSON בפורמט המתאים:

חיפוש דפים/פתקים:
\`\`\`json
{"service": "notion", "action": "search", "query": "משימות"}
\`\`\`

שליפת כל הדפים האחרונים:
\`\`\`json
{"service": "notion", "action": "search", "query": ""}
\`\`\`

קריאת דף מלא לפי מזהה:
\`\`\`json
{"service": "notion", "action": "get_page", "page_id": "PAGE_ID"}
\`\`\``,

  github: `ניהול מאגרים וקוד ב-GitHub: רשימת מאגרים, קריאת קוד מקור וניהול Issues.
כשמבקשים פעולות מול GitHub, אל תבצע בעצמך – המשתמש מריץ עצמאית. החזר ישירות בלוק JSON בפורמט המתאים:

רשימת מאגרים (Repositories):
\`\`\`json
{"service": "github", "action": "list_repos"}
\`\`\`

קריאת קובץ מקור:
\`\`\`json
{"service": "github", "action": "get_file", "repo": "owner/repo", "path": "package.json"}
\`\`\`

יצירת Issue:
\`\`\`json
{"service": "github", "action": "create_issue", "repo": "owner/repo", "title": "באג בכניסה", "body": "פירוט התקלה"}
\`\`\``,

  fetch: `שליפת תוכן מאתרים, קישורים וכרטיסיות בדפדפן (כולל אתרים אישיים שהמשתמש מחובר אליהם עם סיסמה/Session).
אל תנסה להתחבר או לגשת לאתר בעצמך ואל תסביר שאינך יכול לגשת או שדרושה התחברות. המשתמש מריץ לבד שירות שמתחבר ישירות לדף ומשתמש בחיבור הפעיל של המשתמש.
תענה אך ורק בבלוק קוד JSON מדויק:

\`\`\`json
{"service": "fetch", "action": "get_url", "url": "https://example.com"}
\`\`\``
};

const OMNI_DEFAULT_TOOL_PROMPTS_EN = {
  windows: `Local Windows machine control: Launch desktop apps, execute PowerShell/CMD commands, read and write files, directory tree and clipboard.
When the user asks for OS actions, do not explain or simulate. Directly return a single JSON block:

Launch App:
\`\`\`json
{"service": "windows", "action": "open_app", "app_name": "calc"}
\`\`\`

Run PowerShell Command:
\`\`\`json
{"service": "windows", "action": "run_command", "command": "Get-Process"}
\`\`\`

Read Local File:
\`\`\`json
{"service": "windows", "action": "read_file", "path": "C:\\\\Users\\\\path\\\\file.txt"}
\`\`\`

List Directory:
\`\`\`json
{"service": "windows", "action": "list_directory", "path": "C:\\\\Users\\\\path"}
\`\`\``,

  supabase: `PostgreSQL database on Supabase: List tables, inspect schema and execute SQL queries.
When requested database info or queries, directly return a single JSON block:

List tables:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"}
\`\`\`

Query rows:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT * FROM users LIMIT 10;"}
\`\`\`

Inspect column schema:
\`\`\`json
{"service": "supabase", "action": "execute_sql", "query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';"}
\`\`\``,

  notion: `Notion Workspace: Search notes and pages, read full content and create tasks.
When notes/pages/tasks are requested, directly return a single JSON block:

Search pages/notes:
\`\`\`json
{"service": "notion", "action": "search", "query": "tasks"}
\`\`\`

Fetch all recent pages:
\`\`\`json
{"service": "notion", "action": "search", "query": ""}
\`\`\`

Read full page by ID:
\`\`\`json
{"service": "notion", "action": "get_page", "page_id": "PAGE_ID"}
\`\`\``,

  github: `GitHub code repository management: List repositories, read source files and manage issues.
When GitHub operations are requested, directly return a single JSON block:

List Repositories:
\`\`\`json
{"service": "github", "action": "list_repos"}
\`\`\`

Read source file:
\`\`\`json
{"service": "github", "action": "get_file", "repo": "owner/repo", "path": "package.json"}
\`\`\`

Create Issue:
\`\`\`json
{"service": "github", "action": "create_issue", "repo": "owner/repo", "title": "Login bug", "body": "Issue details"}
\`\`\``,

  fetch: `Fetch web page content and open browser tabs (including authenticated personal sessions).
Do not explain that you cannot access the internet; the user runs a local scraper bridge. Return only a single JSON block:

\`\`\`json
{"service": "fetch", "action": "get_url", "url": "https://example.com"}
\`\`\``
};

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
  const enabledTools = [];

  // הוספת הכלים המובנים הפעילים
  activeServices.forEach(id => {
    if (id !== 'custom' && OMNI_MCP_REGISTRY[id]) {
      const baseTool = OMNI_MCP_REGISTRY[id];
      const customPrompt = customToolPrompts && customToolPrompts[id] ? customToolPrompts[id].trim() : '';

      enabledTools.push({
        ...baseTool,
        customPrompt: customPrompt
      });
    }
  });

  // הוספת שרתי ה-Custom MCP הפעילים
  if (activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_'))) {
    const validCustoms = Array.isArray(customServers) ? customServers.filter(s => s.enabled !== false && s.url) : [];
    
    if (validCustoms.length > 0) {
      validCustoms.forEach((cs, idx) => {
        const srvId = cs.id || `custom_${idx + 1}`;
        const srvName = cs.name ? `${cs.name} (Custom MCP)` : `Custom MCP #${idx + 1}`;
        const srvDesc = cs.customPrompt ? cs.customPrompt : 'חיבור לשרת מותאם אישית.';
        const srvIntent = cs.customPrompt ? `הנחיות ייעודיות: ${cs.customPrompt}` : `שימוש בכלים של שרת ${cs.name || srvId}.`;
        
        enabledTools.push({
          id: srvId,
          name: srvName,
          icon: '🔌',
          description: srvDesc,
          userIntentMapping: srvIntent,
          schema: {
            service: 'custom',
            server_id: srvId,
            tool_name: 'שם הכלי',
            arguments: {}
          },
          examples: [
            `{"service": "custom", "server_id": "${srvId}", "tool_name": "example_tool", "arguments": {}}`
          ]
        });
      });
    } else if (OMNI_MCP_REGISTRY.custom) {
      enabledTools.push(OMNI_MCP_REGISTRY.custom);
    }
  }

  let detailedServicesExplanation = enabledTools.map((tool, index) => {
    if (tool.customPrompt) {
      return `### כלי ${index + 1}: ${tool.name} (service: "${tool.id || 'custom'}")
${tool.customPrompt}`;
    }

    return `### כלי ${index + 1}: ${tool.name} (service: "${tool.id || 'custom'}")
• תיאור היכולות: ${tool.description}
• הבנת הקשר כוונת המשתמש: ${tool.userIntentMapping}
• דוגמת פורמט הפקודה:
\`\`\`json
${tool.examples ? tool.examples[0] : '{}'}
\`\`\``;
  }).join('\n\n');

  const intentRules = [];
  if (activeServices.includes('supabase')) {
    intentRules.push('   - "טבלאות", "מסד נתונים", "נתונים", "סופה בייס" או "SQL" -> שייך לשירות Supabase. הוצא פקודת execute_sql.');
  }
  if (activeServices.includes('notion')) {
    intentRules.push('   - "פתקים", "דפים", "רשימות", "משימות" או "נושן" -> שייך לשירות Notion (אין להפנות ל-Google Keep או שירותים אחרים).');
  }
  if (activeServices.includes('windows')) {
    intentRules.push('   - פתיחת תוכנות, ניהול קבצים, פקודות במחשב -> שייך לשירות Windows.');
  }
  if (activeServices.includes('fetch')) {
    intentRules.push('   - קישורי אינטרנט או בקשות קריאת אתר -> שייך לשירות Fetch.');
  }
  if (activeServices.includes('github')) {
    intentRules.push('   - מאגרים, Issues, קוד ב-GitHub -> שייך לשירות GitHub.');
  }
  if (activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_'))) {
    intentRules.push('   - שרתי Custom מותאמים אישית -> פעל לפי ההנחיות והפורמט שצוינו עבורם.');
  }

  const intentRulesText = intentRules.length > 0
    ? `1. הבנת כוונת המשתמש:\n${intentRules.join('\n')}`
    : `1. השתמש אך ורק בכלים המוגדרים למעלה.`;

  return `היי! בשיחה זו מוגדרים עבורך הכלים והשירותים הבאים. המשתמש מריץ את הפקודות עצמאית, לכן בכל בקשה לביצוע פעולה עליך להחזיר ישירות את פקודת ה-JSON המתאימה.

==================================================
📋 פירוט הכלים הזמינים בשיחה והפורמט הנדרש:
==================================================

${detailedServicesExplanation}

==================================================
⛔ כללי ברזל והנחיות:
==================================================

${intentRulesText}

2. פורמט תגובה:
   - כאשר מתבקשת פעולה הדורשת אחד מהכלים מעלה, אל תנסה להריץ בעצמך ואל תיתן הסברים מקדימים.
   - החזר ישירות בלוק JSON יחיד ומדויק של הפקודה הנדרשת.
   - אל תוציא פקודות או קריאות לשירותים שאינם מופיעים ברשימת הכלים הפעילים למעלה.
   - כאשר מוחזרת אליך תוצאה של הפעולה בתור [MCP_RESPONSE], נתח אותה והצג למשתמש תשובה ברורה בעברית.

אם הבנת את כל ההקשרים והכללים, אשר כעת במילה אחת בלבד: "מוכן".`.trim();
}

/**
 * מייצר פרומפט ממוקד ומדויק עבור כלי ספציפי שנבחר מתפריט ה-@
 */
function generateSingleToolPrompt(serviceId, customServerConfig = null, customToolPrompts = {}) {
  // אם הוגדר פרומפט מותאם אישית לכלי זה
  if (customToolPrompts && customToolPrompts[serviceId] && customToolPrompts[serviceId].trim()) {
    const toolName = OMNI_MCP_REGISTRY[serviceId] ? OMNI_MCP_REGISTRY[serviceId].name : serviceId;
    return `[הנחיה ל-Gemini: כלי פעיל: ${toolName}.
${customToolPrompts[serviceId].trim()}
הוצא ישירות בלוק JSON מתאים לפעולה. לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
  }

  let tool = OMNI_MCP_REGISTRY[serviceId];

  if (customServerConfig || serviceId === 'custom' || (typeof serviceId === 'string' && serviceId.startsWith('custom_'))) {
    const cs = customServerConfig || {};
    const srvId = cs.id || serviceId || 'custom';
    const srvName = cs.name ? `${cs.name} (Custom MCP)` : 'Custom MCP';
    const srvDesc = cs.customPrompt || 'חיבור לשרת מותאם אישית.';
    const exampleCall = cs.exampleCall || `{"service": "custom", "server_id": "${srvId}", "tool_name": "example_tool", "arguments": {}}`;

    return `[הנחיה ל-Gemini: כלי פעיל: ${srvName}.
תיאור: ${srvDesc}
לביצוע הבקשה, החזר ישירות בלוק JSON יחיד בפורמט:
\`\`\`json
${exampleCall}
\`\`\`
לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
  }

  if (!tool) {
    return `[הנחיה ל-Gemini: לביצוע בקשה זו, השתמש בכלי ${serviceId} והוצא בלוק JSON מתאים בלבד.]\n\nבקשת המשתמש: `;
  }

  if (serviceId === 'fetch') {
    return `[הנחיה ל-Gemini: כלי פעיל: ${tool.name}.
אל תנסה להתחבר או לגשת לאתר בעצמך ואל תסביר שאינך יכול לגשת או שדרושה התחברות. המשתמש מריץ לבד שירות שמוריד ומתחבר למידע שבדף.
תענה אך ורק בקוד JSON:
\`\`\`json
{"service": "fetch", "action": "get_url", "url": "URL_HERE"}
\`\`\`
לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
  }

  return `[הנחיה ל-Gemini: כלי פעיל: ${tool.name}.
המשתמש מריץ את הפקודות עצמאית. לביצוע הבקשה, אל תבצע בעצמך ואל תסביר – החזר ישירות בלוק JSON יחיד ומדויק בפורמט:
\`\`\`json
${tool.examples[0]}
\`\`\`
לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
}
