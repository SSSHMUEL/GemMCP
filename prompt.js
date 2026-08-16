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
    name: 'Notion Workspace (פתקים, מסמכים, רשימות ומשימות)',
    icon: '📝',
    description: 'הפקת פקודות בפורמט JSON עבור Notion (חיפוש פתקים ודפים, קריאת תוכן, יצירת פתקים ומשימות).',
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
    icon: '🐙',
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
  windows: `שירות: Windows OS Tools
כשמבקשים פעולה במחשב, אל תבצע בעצמך – המשתמש יריץ את הפקודה לבד.
עליך לספק אך ורק בלוק JSON בפורמט המתאים, ללא שום כיתוב נוסף וללא הודעות סירוב:

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

  supabase: `שירות: Supabase Database
כשמבקשים מידע על טבלאות, נתונים או שאילתות, המשתמש יריץ את הפקודה לבד. החזר ישירות בלוק JSON יחיד ומדויק בלבד:

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

  notion: `שירות: Notion Workspace
כשמבקשים מידע על פתקים, דפים או משימות, המשתמש יריץ את הפקודה לבד. החזר ישירות בלוק JSON יחיד ומדויק בלבד:

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

  github: `שירות: GitHub Integration
כשמבקשים פעולות מול GitHub, המשתמש יריץ את הפקודה לבד. החזר ישירות בלוק JSON יחיד ומדויק בלבד:

יצירת מאגר (Repository) חדש:
\`\`\`json
{"service": "github", "action": "create_repo", "name": "my-new-project", "description": "תיאור הפרויקט", "private": true}
\`\`\`

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

  fetch: `שירות: Web Fetch
כשמבקשים קריאת קישור או דף אינטרנט, המשתמש יריץ את הפעולה לבד. תענה אך ורק בבלוק קוד JSON מדויק ללא שום כיתוב נוסף:

\`\`\`json
{"service": "fetch", "action": "get_url", "url": "https://example.com"}
\`\`\``
};

const OMNI_DEFAULT_TOOL_PROMPTS_EN = {
  windows: `Service: Windows OS Tools
When asked for actions, do not execute yourself – the user will run the command directly.
Return ONLY a single valid JSON block without any extra text or refusals:

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

  supabase: `Service: Supabase Database
When database info or queries are requested, the user will run the command directly. Return directly a single JSON block only:

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

  notion: `Service: Notion Workspace
When notes or pages are requested, the user will run the command directly. Return directly a single JSON block only:

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

  github: `Service: GitHub Integration
When GitHub operations are requested, the user will run the command directly. Return directly a single JSON block only:

Create new Repository:
\`\`\`json
{"service": "github", "action": "create_repo", "name": "my-new-app", "description": "Project description", "private": true}
\`\`\`

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

  fetch: `Service: Web Fetch
When requested to fetch a URL, the user will run the request directly. Return only a single JSON block without extra text:

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
        const srvName = cs.name ? `${cs.name} (Custom)` : `Custom #${idx + 1}`;
        const srvDesc = cs.customPrompt ? cs.customPrompt : 'פקודות מותאמות אישית.';
        const srvIntent = cs.customPrompt ? `הנחיות ייעודיות: ${cs.customPrompt}` : `שימוש בכלים של ${cs.name || srvId}.`;
        
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
    intentRules.push('   - "טבלאות", "מסד נתונים", "נתונים", "סופה בייס" או "SQL" -> שייך לשירות Supabase. החזר פקודת execute_sql.');
  }
  if (activeServices.includes('notion')) {
    intentRules.push('   - "פתקים", "דפים", "רשימות", "משימות" או "נושן" -> שייך לשירות Notion.');
  }
  if (activeServices.includes('windows')) {
    intentRules.push('   - פתיחת תוכנות, ניהול קבצים, פקודות מערכת -> שייך לשירות Windows (החזר בלוק JSON בלבד).');
  }
  if (activeServices.includes('fetch')) {
    intentRules.push('   - קישורי אינטרנט או בקשות קריאת אתר -> שייך לשירות Fetch.');
  }
  if (activeServices.includes('github')) {
    intentRules.push('   - מאגרים, Issues, קוד ב-GitHub -> שייך לשירות GitHub.');
  }
  if (activeServices.includes('custom') || activeServices.some(s => s.startsWith('custom_'))) {
    intentRules.push('   - שרתים מותאמים אישית -> פעל לפי ההנחיות והפורמט שצוינו עבורם.');
  }

  const intentRulesText = intentRules.length > 0
    ? `1. הבנת כוונת המשתמש:\n${intentRules.join('\n')}`
    : `1. השתמש אך ורק בכלים המוגדרים למעלה.`;

  return `כאשר המשתמש מבקש לבצע פעולות, אל תבצע בעצמך ואל תסביר שאינך יכול – המשתמש יריץ את הפקודות לבד.
תפקידך לספק את הפקודה הנדרשת ישירות בבלוק JSON בלבד לפי הפורמטים המוגדרים למטה, ללא שום כיתוב מיותר, ללא הסברים מקדימים וללא שאלות.

==================================================
📋 פירוט הפורמטים הזמינים:
==================================================

${detailedServicesExplanation}

==================================================
🎯 מיפוי כוונות משתמש:
==================================================
${intentRulesText}

==================================================
⛔ הנחיות תגובה מדויקות:
==================================================
1. בכל בקשה לפעולה – החזר ישירות אך ורק בלוק JSON יחיד ומדויק ללא שום טקסט נוסף לפניו או אחריו.
2. לעולם אל תסרב לבקשה ואל תכתוב הודעות סירוב כגון "אינני מחובר למערכת הפעלה" או "אין לי גישה".
3. כאשר מוחזרת אליך תוצאה של הפעולה בתור [MCP_RESPONSE] – נתח אותה והצג למשתמש תשובה ברורה בעברית.

אם הבנת את כל ההקשרים והכללים, אשר כעת במילה אחת בלבד: "מוכן".`.trim();
}

/**
 * מייצר פרומפט ממוקד ומדויק עבור כלי ספציפי שנבחר מתפריט ה-@
 */
function generateSingleToolPrompt(serviceId, customServerConfig = null, customToolPrompts = {}) {
  // אם הוגדר פרומפט מותאם אישית לכלי זה
  if (customToolPrompts && customToolPrompts[serviceId] && customToolPrompts[serviceId].trim()) {
    return `[${customToolPrompts[serviceId].trim()}
כשהמשתמש מבקש פעולה, המשתמש יריץ את הפקודה לבד. החזר ישירות בלוק JSON בלבד ללא שום כיתוב נוסף וללא סירוב. לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
  }

  let tool = OMNI_MCP_REGISTRY[serviceId];

  if (customServerConfig || serviceId === 'custom' || (typeof serviceId === 'string' && serviceId.startsWith('custom_'))) {
    const cs = customServerConfig || {};
    const srvId = cs.id || serviceId || 'custom';
    const exampleCall = cs.exampleCall || `{"service": "custom", "server_id": "${srvId}", "tool_name": "example_tool", "arguments": {}}`;

    return `[כשהמשתמש מבקש פעולה, המשתמש יריץ את הפקודה לבד. החזר ישירות בלוק JSON בלבד בפורמט:
\`\`\`json
${exampleCall}
\`\`\`
לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
  }

  if (!tool) {
    return `[המשתמש יריץ את הפקודה לבד. ספק ישירות בלוק JSON בלבד עבור ${serviceId} ללא שום כיתוב נוסף. לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]\n\nבקשת המשתמש: `;
  }

  return `[כאשר המשתמש מבקש לבצע פעולה, אל תבצע בעצמך – המשתמש יריץ את הפקודה לבד.
עליך לספק את הפקודה הנדרשת ישירות בבלוק JSON בלבד, ללא שום כיתוב נוסף וללא סירוב:
\`\`\`json
${tool.examples[0]}
\`\`\`
לאחר קבלת [MCP_RESPONSE] ענה למשתמש בפירוט.]

בקשת המשתמש: `;
}



