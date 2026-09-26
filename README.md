# GemMCP 🚀
### גשר MCP (Model Context Protocol) וכלי מערכת מתקדמים עבור Gemini, Claude ו-ChatGPT

**GemMCP** מחבר את ממשקי הדפדפן של מודלי ה-AI המובילים (**Gemini**, **Claude**, **ChatGPT**) ישירות למחשב ה-Windows שלך ולשרתי MCP מקומיים וענניים. המערכת מעניקה ל-AI יכולות אוטומציה אמיתיות, גישה למערכת הקבצים, מסדי נתונים, שירותי ענן והרצת פקודות בזמן אמת.

---

## 🇮🇱 מדריך ומפרט יכולות בעברית

### 🌟 יכולות עיקריות (Key Capabilities)

* 🔌 **אינטגרציה ישירה בדפדפן:** התוסף מתחבר אוטומטית לממשקי הווב של Gemini, Claude ו-ChatGPT ומזריק לתוכם יכולות הפעלת כלים.
* ⚡ **שרת גישור מקומי (Windows Bridge Server):** שרת Express & WebSocket קל ומהיר המבצע את הפקודות במחשב בצורה מאובטחת.
* 🤖 **שרת API תואם OpenAI (מקומי וברשת):**
  * נקודת קצה מקומית ב-`http://127.0.0.1:3000/v1` וברשת הביתית `http://<IP>:3000/v1`.
  * מאפשר חיבור של כלי פיתוח חיצוניים (כמו **Cursor**, **Cline**, סקריפטים ב-Python ואפליקציות).
  * **ניתוב חכם לפי מודל:** שליחת שאילתות ישירות לממשקי הווב ברקע (`model: "gemini"`, `model: "claude"`, `model: "chatgpt"`).
* 🛠️ **תמיכה מלאה בפרוטוקול MCP:** תמיכה ב-JSON-RPC, הרצת כלים, קבלת רשימת כלים (Tool Listing), חיבורי SSE ושרתי MCP מותאמים אישית.
* 🔐 **אינטגרציית OAuth 2.0 מובנית:** חיבור מהיר בלחיצה לשירותי **GitHub**, **Notion** ו-**Supabase**.
* 🌐 **תמיכה בריבוי שפות (i18n):** ממשק משתמש והודעות תומכים באופן מלא בעברית ובאנגלית.
* 🗄️ **סנכרון ענן מאובטח (Supabase):** שמירה וניהול הגדרות ומפתחות בצורה מוצפנת מבלי לחשוף סודות מקומיים.
* 🔄 **עדכונים פשוטים:** בדיקת עדכונים ישירות מחלון התוסף או באמצעות קובץ הפעלה מהיר `update.bat`.

---

### 📦 מדריך התקנה והפעלה מהיר

#### 📋 דרישות קדם
1. **Node.js (גרסה 18 ומעלה):** [להורדה מהאתר הרשמי](https://nodejs.org/).
2. **דפדפן מבוסס כרומיום:** Google Chrome, Microsoft Edge, Brave וכו'.

---

#### 1️⃣ הורדה וחילוץ
1. הורידו את הפרויקט כקובץ ZIP (או בצעו `git clone`).
2. חלצו את הקבצים לתיקייה קבועה במחשב (למשל `C:\GemMCP` או בתיקיית המסמכים).
   > ⚠️ **חשוב:** אין למחוק או להעביר את התיקייה לאחר ההתקנה.

---

#### 2️⃣ התקנת התוסף בדפדפן
1. פתחו את הדפדפן והיכנסו אל `chrome://extensions/` (או `edge://extensions/`).
2. הפעילו את מתג **מצב מפתח (Developer mode)** בפינה העליונה.
3. לחצו על **טען פריט שלא נארז (Load unpacked)** ובחרו בתיקיית הפרויקט הראשית (היכן שנמצא `manifest.json`).
4. מומלץ: נעצו את סמל GemMCP בסרגל הכלים לנוחות מרבית.

---

#### 3️⃣ הפעלת שרת הגישור
* **הפעלה מהירה בלחיצה כפולה (מומלץ):** הפעילו את הקובץ `start-bridge.bat` (או `bridge-launcher.bat`).  
  *(בהפעלה הראשונה יותקנו אוטומטית כל הספריות הנדרשות, והשרת ירוץ בכתובת `http://localhost:3000`)*.
* **או הפעלה ידנית מטרמינל:**
  ```bash
  cd bridge-server
  npm install
  npm start
  ```

---

#### 🔄 עדכון גרסאות
* **דרך חלון התוסף:** לחצו על סמל הריענון 🔄 בחלון הפופאפ.
* **עדכון מלא בלחיצה:** הפעילו את `update.bat` לעדכון הקוד והספריות מ-GitHub.

---
---

## 🇬🇧 English Documentation

### ✨ Key Features

- 🔌 **Plug & Play Browser Extension:** Seamlessly injects tool execution capabilities into Gemini, Claude, and ChatGPT Web interfaces.
- ⚡ **Local Windows Bridge Server:** Ultra-fast Express & WebSocket server acting as a secure bridge between your browser and local system tools.
- 🤖 **Local & Network OpenAI-Compatible API:**
  - Local endpoint: `http://127.0.0.1:3000/v1`
  - LAN / Network endpoint: `http://<YOUR_LOCAL_IP>:3000/v1`
  - Connect external AI coding agents (**Cursor**, **Cline**, Python apps) directly to browser web models using `model: "gemini"`, `model: "claude"`, or `model: "chatgpt"`.
- 🛠️ **Full MCP Protocol Support:** Standard JSON-RPC, SSE, tool discovery, and custom MCP integrations.
- 🔐 **Built-in OAuth 2.0:** One-click authentication for **GitHub**, **Notion**, and **Supabase**.
- 🗄️ **Secure Supabase Cloud Sync:** Sync configurations securely without exposing secrets.
- 🌐 **Full Multilingual Support (i18n):** Native Hebrew & English UI support.

---

### 📦 Quick Setup (English)

1. **Prerequisites:** Install [Node.js (v18+)](https://nodejs.org/) & Chrome / Edge / Brave.
2. **Install Extension:** Go to `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the project folder.
3. **Start Bridge:** Double-click `start-bridge.bat` (or run `npm start` inside `bridge-server/`).

---

### 📁 Project Structure

```text
gemmcp/
├── manifest.json          # Chrome Extension Manifest (V3)
├── background.js          # Service worker & message router
├── content.js             # Web page tool injector (Gemini, Claude, ChatGPT)
├── content.css            # Injected UI styling
├── popup/                 # Settings UI & OAuth handlers
├── i18n.js                # Internationalization strings (Hebrew / English)
├── icons/                 # Extension icons
├── bridge-server/         # Node.js backend bridge server
│   ├── server.js          # Express & WebSocket server (MCP & OpenAI API)
│   ├── setup_rpc.sql      # Supabase schema & RPC configuration
│   └── .env.example       # Environment variables template
├── start-bridge.bat       # One-click Windows Bridge launcher
├── update.bat             # One-click auto updater
└── test-simulator.html    # Standalone browser testing suite
```

---

## 🔒 Security & Privacy / אבטחה ופרטיות

- Sensitive tokens and API keys are stored securely using Supabase Service Role RPCs or isolated local environment variables (`.env`).
- Local communication occurs strictly over local loopback interfaces (`127.0.0.1` / `localhost`).
- No conversation history or private prompts are ever transmitted to third parties outside your explicitly connected tools.

---

## ⚠️ Disclaimer & Liability / כתב ויתור והצהרת אחריות

> **🇮🇱 עברית:** פרויקט זה מופץ כתוכנת קוד פתוח "כמות שהוא" (AS IS). מתן גישה למודלי AI להרצת פקודות מקומיות וגישה לקבצים נעשית באחריות המשתמש בלבד. מומלץ לעבור על קוד המקור והפקודות לפני השימוש.
> 
> **🇬🇧 English:** GemMCP is provided as open-source software on an "AS IS" basis. Executing local system commands via AI tools carries inherent risks. Users are solely responsible for reviewing and verifying all configured tools and actions.

---

## 📄 License
MIT License. Created with ❤️ by [SSSHMUEL](https://github.com/SSSHMUEL).
