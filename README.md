# GemMCP 🚀
### Seamless MCP (Model Context Protocol) Bridge for Gemini Web & AI Assistants

GemMCP connects your browser (Gemini Web, AI chat interfaces) directly to local and cloud Model Context Protocol (MCP) servers with zero hassle. It empowers your AI conversations with real-time tool execution, live database access, and full local automation.

---

## ✨ Features

- 🔌 **Plug & Play Chrome Extension:** Injects tools directly into the Gemini Web interface.
- ⚡ **Local Bridge Server:** Ultra-fast Express & WebSocket server acting as a bridge between the browser and local MCP tools.
- 🔐 **OAuth 2.0 Integration:** Built-in seamless authentication for **GitHub**, **Notion**, and **Supabase**.
- 🗄️ **Supabase Cloud Sync:** Dynamic settings and secrets management via secure database backend.
- 🛡️ **Zero Secret Leaks:** Local storage never exposes private secrets; `.env` is fully isolated and ignored by Git.
- 🛠️ **Full MCP Protocol Support:** Supports list tools, tool execution, JSON-RPC, SSE, and custom MCP integrations.

---

## 📦 Installation & Setup Guide

### 📋 Prerequisites
- **Node.js (v18 or higher):** Required to run the local Windows Bridge Server. [Download & Install Node.js](https://nodejs.org/).
- **Google Chrome** (or any Chromium-based browser like Brave, Edge).

---

### 1️⃣ Download & Extract
1. Download the project as a ZIP archive (click **Code** > **Download ZIP** on GitHub).
2. **Extract the ZIP file** to a permanent folder on your computer (e.g., `C:\GemMCP` or `Documents`).
   > ⚠️ **Important:** Do not delete or move this folder after installation.

---

### 2️⃣ Install the Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/` (or click **Menu (⋮)** > **Extensions** > **Manage Extensions**).
2. Turn ON **Developer mode** (מצב מפתח) in the top-right corner.
3. Click the **Load unpacked** (טען פריט שלא נארז) button in the top-left corner.
4. ⚠️ **Select only the `extension` folder** inside the extracted directory (do NOT select the root folder or other subfolders).
5. (Recommended) Click the puzzle piece icon in Chrome and **Pin GemMCP** to your toolbar.

---

### 3️⃣ Start the Windows Bridge Server

#### Option A: One-Click Startup (Recommended)
Double-click `start-bridge.bat` (or `bridge-launcher.bat`) located in the root project folder.
> 💡 **Auto-Setup:** On the first run, the script automatically installs all required dependencies (`npm install`) if missing, and immediately starts the server on `http://localhost:3000`.

#### Option B: Manual Terminal Startup
1. Open PowerShell or Command Prompt inside the `bridge-server/` directory:
   ```bash
   cd bridge-server
   npm install
   npm start
   ```
2. The server will start and listen on `http://localhost:3000`.

---

---

## 🇮🇱 מדריך התקנה ושימוש בעברית

### 📋 דרישות קדם
- **Node.js (גרסה 18 ומעלה):** חובה להתקין במחשב לצורך הפעלת שרת הגישור (Bridge Server) המקומי ב-Windows.  
  [הורדת Node.js מהאתר הרשמי](https://nodejs.org/).
- **דפדפן Google Chrome** (או כל דפדפן מבוסס Chromium כמו Brave או Edge).

---

### 1️⃣ הורדה וחילוץ הקבצים
1. לחצו על כפתור **Code** הירוק בראש עמוד ה-GitHub ובחרו ב-**Download ZIP**.
2. **חלצו את קובץ ה-ZIP** לתיקייה קבועה במחשב שלכם (לדוגמה: `C:\GemMCP` או בתוך תיקיית המסמכים).
   > ⚠️ **חשוב:** אין למחוק או להעביר את התיקייה לאחר ההתקנה, אחרת התוסף בדפדפן יפסיק לעבוד.

---

### 2️⃣ התקנת התוסף בדפדפן Chrome
1. פתחו את דפדפן Chrome והיכנסו לכתובת: `chrome://extensions/` (או דרך תפריט 3 הנקודות > **תוספים** > **ניהול תוספים**).
2. הפעילו את מתג **מצב מפתח (Developer mode)** בפינה העליונה.
3. לחצו על הכפתור **טען פריט שלא נארז (Load unpacked)**.
4. ⚠️ **בחרו אך ורק את תיקיית `extension`** הנמצאת בתוך התיקייה שחילצתם (אל תבחרו את התיקייה הראשית כולה!).
5. מומלץ: לחצו על סמל הפאזל בסרגל הדפדפן ונעצו (Pin) את **GemMCP** לסרגל הכלים.

---

### 3️⃣ הפעלת שרת ה-Windows Bridge

#### אפשרות א': הפעלה בלחיצה אחת (מומלץ)
לחצו לחיצה כפולה על הקובץ `start-bridge.bat` (או `bridge-launcher.bat`) הנמצא בתיקייה הראשית של הפרויקט.  
> 💡 **התקנה אוטומטית:** בהפעלה הראשונה, הסקריפט מזהה אוטומטית אם חסרות ספריות ומבצע `npm install` עצמאית ברקע, ולאחר מכן מפעיל מיד את השרת בכתובת `http://localhost:3000`.

#### אפשרות ב': הפעלה ידנית דרך הטרמינל
1. פתחו את ה-PowerShell או ה-CMD בתוך תיקיית `bridge-server`:
   ```bash
   cd bridge-server
   npm install
   npm start
   ```
2. השרת ייפתח ויאזין בכתובת `http://localhost:3000`.

---

---

### 🔄 איך לעדכן גרסה (Updates)
ישנן שתי דרכים פשוטות לעדכון הפרויקט:
1. **בדיקת עדכון מתוך התוסף:** לחצו על סמל הריענון 🔄 בראש חלון התוסף (Popup) כדי לבדוק מול GitHub אם יש גרסה חדשה.
2. **עדכון מלא בלחיצת כפתור (`update.bat`):** לחצו לחיצה כפולה על הקובץ `update.bat` בתיקייה הראשית. הסקריפט ימשוך את הגרסה האחרונה מ-GitHub, יעדכן את חבילות ה-Node.js, וירשום את הפרוטוקול מחדש. לאחר מכן רק רעננו את התוסף ב-`chrome://extensions/`.

---

## 📁 Project Architecture

```
gemmcp/
├── bridge-server/         # Node.js backend bridge
│   ├── server.js          # Express & WebSocket server handling MCP & OAuth
│   ├── setup_rpc.sql      # Supabase schema & RPC configuration
│   └── .env.example       # Environment template
│
├── extension/             # Chrome Extension (Manifest V3)
│   ├── background.js      # Service worker & message router
│   ├── content.js         # Gemini Web page script injector
│   ├── content.css        # Injected UI styles
│   └── popup/             # Settings UI & OAuth callback handlers
│
└── test-simulator.html    # Standalone browser test suite
```

---

## 🔒 Security & Privacy

- Sensitive tokens and API keys are stored securely using Supabase Service Role RPCs or isolated environment variables.
- The extension communicates with local services over loopback interfaces (`127.0.0.1` / `localhost`).
- No conversation data or prompt text is ever logged or transferred outside of your configured tools.

---

## ⚠️ Disclaimer & Liability / כתב ויתור והצהרת אחריות

### 🇬🇧 English:
> **IMPORTANT SECURITY NOTICE:**  
> This project is provided as **open-source software on an "AS IS" basis**, without warranty of any kind, express or implied.
> - **Local Access & System Permissions:** GemMCP can bridge AI interfaces with your local operating system and active browser tabs. Granting automated tools or AI models access to execute local commands, modify files, or interact with authenticated sessions carries inherent security risks.
> - **User Responsibility:** You are solely responsible for reviewing the tools and MCP servers you configure, the commands permitted, and any data accessed. Always exercise caution and verify actions before running potentially destructive operations.
> - **Code Audit:** It is strongly recommended to review the source code and configuration files prior to installation and execution.

---

### 🇮🇱 עברית:
> **הודעת אבטחה ואחריות חשובה:**  
> פרויקט זה מופץ כתוכנת **קוד פתוח "כמות שהוא" (AS IS)**, והשימוש בו הוא **באחריות המשתמש בלבד**.
> - **גישה למחשב ולדפדפן:** המערכת מאפשרת לגשר בין מודל ה-AI לבין מערכת ההפעלה המקומית וכרטיסיות הדפדפן שלכם. מתן הרשאות להרצת פקודות מקומיות, גישה לקבצים או אינטראקציה עם חשבונות מחוברים דורשת זהירות מרבית.
> - **אחריות בלעדית:** המשתמש נושא באחריות המלאה והבלעדית לכל פעולה, שינוי, מחיקה או נזק שעלולים להיגרם כתוצאה מהרצת פקודות או חיבור שרתי MCP.
> - **בדיקת הקוד:** מומלץ מאוד לעבור על קוד המקור, הסקריפטים וקובצי ההגדרות לפני ההתקנה וההפעלה במחשבכם.

---

## 📄 License
MIT License. Created by [SSSHMUEL](https://github.com/SSSHMUEL).

