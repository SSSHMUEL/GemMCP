const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile } = require('child_process');
const { createFileActions } = require('./actions-files');
const { readSmart } = require('./read-smart');
const { createJob: createInstallJob, cancelJob: cancelInstallJob } = require('./install-jobs');
const { resolveAppCandidates } = require('./resolve-app');
const { runGh } = require('./github-cli');

// נקרא בכל קריאה ולא פעם אחת בעליית התהליך, כדי ששינוי במסך ההגדרות
// יחול על הפקודה הבאה ולא ידרוש הפעלה מחדש של הגשר.
function commandTimeoutMs() {
  const n = Number(process.env.WIN_COMMAND_TIMEOUT_MS);
  if (!Number.isFinite(n) || n < 1000 || n > 600000) return 30000;
  return n;
}

// בדיקה קצרה בתהליך נפרד: איזה תהליך מחזיק כרגע את החלון שבחזית, ומי ההורה
// שלו. מריצים אותה רק אחרי שסקריפט המיקוד הסתיים, כי כל עוד הוא חי המצב
// שהוא רואה אינו המצב שנשאר על המסך.
const FOREGROUND_PROBE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class GemFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$p = 0
[void][GemFg]::GetWindowThreadProcessId([GemFg]::GetForegroundWindow(), [ref]$p)
$parent = 0
if ($p -ne 0) {
  try { $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").ParentProcessId } catch { }
}
Write-Output "GEMMCP_FRONT $p $parent"
`;

async function handleWindowsExecute(req, res, deps) {
  const { resolvePermissions, auditLog, canonicalise, expandPath, isPathInside, isSystemPath, checkDangerousWindowsCommands } = deps;
  try {
    const { action, params = {}, permissions = {} } = req.body;
    const perms = resolvePermissions(permissions);

    // עוטפים את res כדי שכל תשובה תירשם ביומן בלי לפזר קריאות auditLog
    const originalJson = res.json.bind(res);
    let logged = false;
    res.json = (body) => {
      if (!logged) {
        logged = true;
        auditLog(action, params, body && body.success ? 'success' : 'denied', body && body.error);
      }
      return originalJson(body);
    };

    // בדיקת נתיב מותר. שני תחומים נפרדים: קריאה וכתיבה.
    //
    // קודם נתיב אחד שלט בשניהם, ולכן כדי לקרוא קובץ מ-Downloads היה צריך
    // לפתוח את Downloads גם למחיקה. קריאה הפיכה, מחיקה לא - אין סיבה
    // שהאחת תגרור את השנייה.
    function validatePathInScope(targetPath, mode) {
      if (!targetPath) return;
      const resolved = canonicalise(path.resolve(expandPath(targetPath)));

      // תיקיות מערכת חסומות תמיד, לפני כל בדיקת היקף. "כל המחשב" פירושו כל
      // מה ששייך למשתמש - לא Windows, לא Program Files ולא ProgramData.
      if (typeof isSystemPath === 'function' && isSystemPath(resolved)) {
        throw new Error(`הגישה לנתיב '${targetPath}' נחסמה: תיקיות מערכת חסומות תמיד, בכל היקף.`);
      }

      const reading = mode === 'read';
      const ceilingRaw = reading ? perms.readPath : perms.allowedPath;
      const ceiling = ceilingRaw ? canonicalise(ceilingRaw) : null;

      if (ceiling && !isPathInside(resolved, ceiling)) {
        throw new Error(
          reading
            ? `הגישה לנתיב '${targetPath}' נחסמה. היקף הקריאה בהגדרות הוא: ${ceilingRaw}`
            : `הגישה לנתיב '${targetPath}' נחסמה. הנתיב המורשה לשינויים הוא: ${ceilingRaw}`
        );
      }
      return resolved;
    }

    switch (action) {
      // 1. קריאת קובץ
      
      case 'media_control': {
        // שליטה במדיה מריצה PowerShell. קודם לא הייתה כאן שום בדיקת הרשאה -
        // כלומר הפעולה רצה גם כשכל ההרשאות כבויות. אומת בהרצה.
        if (!perms.launchApps) {
          return res.status(403).json({ success: false, error: 'הרשאת שליטה בתוכנות (WIN_PERM_APPS) כבויה בשרת.' });
        }
        const cmd = params.command;
        let psCode = '';
        if (cmd === 'mute') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]173)';
        else if (cmd === 'vol_down') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]174)';
        else if (cmd === 'vol_up') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]175)';
        else if (cmd === 'next') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]176)';
        else if (cmd === 'prev') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]177)';
        else if (cmd === 'play_pause') psCode = '$obj = new-object -com wscript.shell; $obj.SendKeys([char]179)';
        
        if (!psCode) return res.status(400).json({ success: false, error: 'Unknown media command' });
        
        return new Promise((resolve) => {
          execFile('powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCode],
            { timeout: 10000, windowsHide: true }, (error) => {
            if (error) resolve(res.json({ success: false, error: error.message }));
            else resolve(res.json({ success: true, data: { message: 'פקודת המדיה נשלחה בהצלחה.' } }));
          });
        });
      }
      
      case 'manage_windows': {
        // אותו פער: הרצת PowerShell בלי בדיקת הרשאה. 'list' גם מונה את כל
        // החלונות הפתוחים על שמותיהם, שזו חשיפת מידע על מה שהמשתמש עושה.
        if (!perms.launchApps) {
          return res.status(403).json({ success: false, error: 'הרשאת שליטה בתוכנות (WIN_PERM_APPS) כבויה בשרת.' });
        }
        const cmd = params.command;
        const appName = params.app_name;
        
        if (cmd === 'list') {
          const psCode = `Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } | Select-Object -Property Id, ProcessName, MainWindowTitle | ConvertTo-Json`;
          return new Promise((resolve) => {
            execFile('powershell.exe',
              ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCode],
              { timeout: 15000, windowsHide: true }, (error, stdout) => {
              if (error) {
                resolve(res.json({ success: false, error: error.message }));
              } else {
                try {
                  const parsed = JSON.parse(stdout || '[]');
                  const list = Array.isArray(parsed) ? parsed : [parsed];
                  resolve(res.json({ success: true, data: { open_windows: list } }));
                } catch (e) {
                  // stdout עשוי להיות undefined כשהפקודה לא הדפיסה דבר, ואז
                  // .trim() היה זורק בתוך ה-catch ומשאיר את הבקשה תלויה.
                  resolve(res.json({ success: true, data: { raw_output: String(stdout || '').trim() } }));
                }
              }
            });
          });
        
        } else if (cmd === 'focus' && appName) {
          const psCode = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ForceFocus {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    // זו ה-API ש-Alt+Tab משתמש בה. היא מצליחה מתהליך רקע במקרים שבהם
    // SetForegroundWindow נדחית, ולכן היא מנוסה בנוסף ולא במקום.
    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);

    // בדיקה אמיתית: החלון שבחזית שייך לאותו תהליך כמו היעד. חלון ראשי של
    // אפליקציה מודרנית לרוב אינו החלון שמקבל מיקוד בפועל - וואטסאפ, למשל,
    // מציג WebView2 שהוא תהליך אחר. השוואת מזהי חלון בלבד החזירה שקר.
    public static uint PidOfForeground() {
        uint pid = 0;
        GetWindowThreadProcessIdOut(GetForegroundWindow(), out pid);
        return pid;
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")]
    public static extern uint GetWindowThreadProcessIdOut(IntPtr hWnd, out uint pid);

    public static void ForceForeground(IntPtr targetHWnd) {
        if (targetHWnd == IntPtr.Zero) return;

        // 9 = SW_RESTORE (restores window even if minimized to taskbar)
        ShowWindow(targetHWnd, 9);

        IntPtr foreHWnd = GetForegroundWindow();
        uint foreThread = GetWindowThreadProcessId(foreHWnd, IntPtr.Zero);
        uint curThread = GetCurrentThreadId();

        if (foreThread != curThread) {
            AttachThreadInput(curThread, foreThread, true);
        }

        // Simulate Alt key press/release to bypass Windows 11 foreground lock
        keybd_event(0x12, 0, 0, 0); // Alt down
        keybd_event(0x12, 0, 2, 0); // Alt up

        BringWindowToTop(targetHWnd);
        SetForegroundWindow(targetHWnd);
        SwitchToThisWindow(targetHWnd, true);

        // כאן היה ניסיון של מזעור ושחזור, והוא הזיק. ההשוואה
        // GetForegroundWindow() != targetHWnd נכשלת כשהחלון שבחזית הוא חלון
        // בן של האפליקציה ולא החלון הראשי - וזה המצב הרגיל באפליקציה מודרנית.
        // התוצאה: החלון שכבר שוחזר בהצלחה מוזער בחזרה מיד אחרי.
        //
        // אומת שקריאה בודדת ל-SW_RESTORE מספיקה: היא הוציאה את החלון ממצב
        // ממוזער והביאה אותו לחזית, בלי שום טכניקה נוספת. לכן לא נוגעים
        // בחלון יותר אחרי השחזור שבתחילת הפונקציה.

        if (foreThread != curThread) {
            AttachThreadInput(curThread, foreThread, false);
        }
    }
}
"@

$target = [regex]::Escape($env:GEMMCP_TARGET)

# בחירת המועמד הנכון, ולא הראשון שנתקלים בו.
#
# אומת: הבקשה ל'whatsapp' התאימה לשלושה תהליכים - msedgewebview2 שכותרתו
# "WhatsApp", WhatsApp.Root בלי חלון כלל, ו-WhatsApp.Root עם החלון האמיתי.
# Select-Object -First 1 בחר את תהליך ה-renderer, שאין לו חלון אפליקציה
# להעלות. הפעולה דיווחה הצלחה ועל המסך לא קרה כלום.
#
# לכן: קודם מסננים למי שיש חלון ראשי בכלל, ואז מעדיפים התאמה בשם התהליך
# על פני התאמה בכותרת - כותרת יכולה להופיע גם בלשונית של דפדפן.
$candidates = Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and (
        ($_.MainWindowTitle -and $_.MainWindowTitle -match $target) -or
        ($_.ProcessName -and $_.ProcessName -match $target)
    )
}

$proc = $candidates | Sort-Object @{
    Expression = {
        if ($_.ProcessName -ieq $env:GEMMCP_TARGET) { 0 }
        elseif ($_.ProcessName -match $target) { 1 }
        else { 2 }
    }
}, @{ Expression = { $_.WorkingSet64 }; Descending = $true } | Select-Object -First 1

if (-not $proc) {
    Write-Error "No window found matching the requested name."
    exit 1
}

$hWnd = $proc.MainWindowHandle
if ($hWnd -ne [IntPtr]::Zero) {
    [ForceFocus]::ForceForeground($hWnd)
} else {
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
    Start-Sleep -Milliseconds 250
    $hWnd = (Get-Process -Id $proc.Id).MainWindowHandle
}

# בודקים מה באמת קרה, ולא מניחים. Windows מסרב להעביר חלון לחזית מתהליך
# שאינו כבר בחזית, והגשר רץ מנותק - כך ש-SetForegroundWindow נכשל בשקט,
# הסקריפט הסתיים בהצלחה, ודווח למשתמש "הוקפץ בהצלחה" בזמן ששום דבר לא זז.
#
# שתי טעויות היו בבדיקה הראשונה שכתבתי, ושתיהן החזירו הצלחה שקרית:
# 1. השוואת מזהה חלון. אפליקציה מודרנית ממקדת חלון של תהליך אחר - וואטסאפ
#    מציג WebView2 - ולכן משווים את שרשרת התהליכים ולא מזהה בודד.
# 2. דגימה אחת 350 מילישניות אחרי. מערכת ההפעלה מחזירה לפעמים את המיקוד
#    מיד אחרי, ואז הדגימה תפסה רגע חולף. עכשיו דורשים התייצבות.
# אי אפשר לאמת מכאן. כל עוד הסקריפט חי, AttachThreadInput עדיין בתוקף
# והחלון אכן נראה בחזית - אבל ברגע שהוא מסתיים ומתנתק, Windows מחזיר את
# המיקוד הקודם. אומת במדידה: הבדיקה מבפנים אמרה "עלה" ב-4 מתוך 4, בזמן
# שבפועל החלון עלה ונשאר רק באחת מהן.
#
# לכן רק מדווחים את התהליכים הרלוונטיים, והאימות נעשה בתהליך נפרד אחרי
# שזה כאן כבר מת - שם נמדד מה שהמשתמש באמת רואה.
$targetPid = $proc.Id
$kin = @($targetPid)
try {
    $kin += (Get-CimInstance Win32_Process -Filter "ParentProcessId=$targetPid" |
             Select-Object -ExpandProperty ProcessId)
} catch { }
Write-Output "GEMMCP_TARGET_PIDS $($kin -join ',') $($proc.ProcessName)"
`;
          return new Promise((resolve) => {
            execFile('powershell.exe',
              ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCode],
              { timeout: 25000, windowsHide: true, env: { ...process.env, GEMMCP_TARGET: String(appName) } },
              (error, stdout, stderr) => {
              const out = String(stdout || '');

              if (error || (stderr && stderr.includes('Error'))) {
                console.warn('[manage_windows focus]', stderr || (error && error.message));
                return resolve(res.json({
                  success: false,
                  error: `לא נמצא חלון פעיל שתואם ל-'${appName}'.`
                }));
              }

              const m = out.match(/GEMMCP_TARGET_PIDS ([\d,]+) (\S+)/);
              if (!m) {
                return resolve(res.json({
                  success: false,
                  error: `לא ניתן לאמת שהחלון של '${appName}' עלה לחזית.`
                }));
              }
              const kin = m[1].split(',').map(Number).filter(Boolean);
              const procName = m[2];

              // האימות רץ בתהליך נפרד, אחרי שסקריפט המיקוד כבר מת. כל עוד
              // הוא חי, AttachThreadInput בתוקף והחלון נראה בחזית גם כשהוא
              // חוזר אחורה מיד אחרי - כלומר בדיקה מבפנים תמיד אומרת "הצליח".
              setTimeout(() => {
                execFile('powershell.exe',
                  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FOREGROUND_PROBE],
                  { timeout: 10000, windowsHide: true }, (e2, o2) => {
                    const fm = String(o2 || '').match(/GEMMCP_FRONT (\d+) (\d+)/);
                    const frontPid = fm ? Number(fm[1]) : 0;
                    const frontParent = fm ? Number(fm[2]) : 0;
                    const inFront = frontPid > 0 &&
                      (kin.includes(frontPid) || kin.includes(frontParent));

                    if (inFront) {
                      return resolve(res.json({
                        success: true,
                        data: { message: `חלון ${appName} נמצא כעת בחזית.` }
                      }));
                    }
                    // החלון כן שוחזר ממצב ממוזער - זה תמיד עובד. מה שלא
                    // תמיד מצליח הוא להשאיר אותו בחזית, כי אפליקציה אחרת
                    // עשויה לקחת את המיקוד בחזרה. מבחינים בין השניים, אחרת
                    // ההודעה משתמעת כאילו כלום לא קרה.
                    resolve(res.json({
                      success: false,
                      error: `החלון של '${appName}' (${procName}) נפתח, אבל תוכנה אחרת לקחה את המיקוד ` +
                             'מיד אחר כך. Windows מתיר להעביר חלון לחזית רק לתוכנה שכבר בחזית, ' +
                             'והגשר רץ ברקע. החלון פתוח - לחיצה עליו בשורת המשימות תמקד אותו.'
                    }));
                  });
                // 2.5 שניות ולא פחות. אומת במדידה: החלון אכן עולה לחזית
                // לרגע, ואז מאבד אותה תוך כשנייה. בדיקה מוקדמת תפסה את
                // ההבזק ודיווחה הצלחה, בזמן שהמשתמש ראה חלון אחר לגמרי.
                // מה שנמדד כאן הוא המצב שנשאר על המסך, וזה מה שנחשב.
              }, 2500);
            });
          });

        }
        return res.status(400).json({ success: false, error: 'Unknown manage_windows command' });
      }

      // הורדה והתקנה, כמשימה שאפשר לבטל.
      //
      // זה הצירוף המסוכן ביותר כאן: קובץ ממקור שאינו בשליטת המשתמש, שרץ על
      // המחשב שלו. לכן הוא דורש אישור תמיד - גם במצב אוטונומי - וכל קובץ
      // שנוצר נרשם, כדי שביטול יחזיר את המחשב למצב שלפני.
      case 'install_from_url': {
        // הרשאה נפרדת משלה. כתיבה והפעלת תוכנות אינן מספיקות: הצירוף של
        // השתיים - להביא קובץ מהרשת ולהריץ אותו - הוא סיכון אחר לגמרי,
        // ולכן הוא כבוי כברירת מחדל ודורש הדלקה מפורשת.
        if (!perms.allowInstall) {
          return res.status(403).json({ success: false, error: 'הורדה והתקנה כבויה. אפשר להדליק אותה בהגדרות התוסף, תחת הרשאות Windows.' });
        }
        if (!perms.writeFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת כתיבת קבצים כבויה בהגדרות התוסף או השרת.' });
        }
        if (!perms.launchApps) {
          return res.status(403).json({ success: false, error: 'הרשאת הפעלת תוכנות כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.url) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר url' });
        }

        let iurl;
        try { iurl = new URL(String(params.url)); } catch (e) {
          return res.status(400).json({ success: false, error: 'כתובת לא תקינה.' });
        }
        if (iurl.protocol !== 'https:') {
          return res.status(400).json({
            success: false,
            error: 'התקנה מותרת רק מכתובת https. הורדה ב-http ניתנת לשינוי בדרך, וכאן מריצים את התוצאה.'
          });
        }

        const iname = path.basename(String(
          params.filename || decodeURIComponent(iurl.pathname.split('/').pop() || '') || 'installer'
        )).replace(/[<>:"|?*]/g, '_');

        // רק סוגי קבצים שהם באמת מתקינים. בלי זה אפשר להוריד ולהריץ כל דבר.
        const INSTALLER_EXT = new Set(['.exe', '.msi']);
        if (!INSTALLER_EXT.has(path.extname(iname).toLowerCase())) {
          return res.status(400).json({
            success: false,
            error: `רק קבצי exe או msi. הקובץ המבוקש הוא '${iname}'. להורדה רגילה השתמש ב-download_file.`
          });
        }

        const job = createInstallJob(iurl.href);
        // תיקיית בידוד לכל משימה, כדי שהביטול ידע בדיוק מה למחוק ולא יגע
        // בקבצים אחרים של המשתמש.
        const stageDir = validatePathInScope(
          path.join(perms.allowedPath || '.', '_gemmcp_installers', job.id)
        );
        const stagePath = path.join(stageDir, iname);

        try {
          fs.mkdirSync(stageDir, { recursive: true });
          job.dirs.push(stageDir, path.dirname(stageDir));

          const timer = setTimeout(() => job.controller.abort(), 180000);
          const dl = await fetch(iurl, { signal: job.controller.signal, redirect: 'follow' });
          clearTimeout(timer);
          if (!dl.ok) throw new Error(`ההורדה נכשלה: ${dl.status} ${dl.statusText}`);

          const bytes = Buffer.from(await dl.arrayBuffer());
          const MAX = Number(process.env.WIN_DOWNLOAD_MAX_BYTES) || 500 * 1024 * 1024;
          if (bytes.length > MAX) throw new Error(`הקובץ גדול מהמותר (${Math.round(bytes.length / 1048576)}MB).`);

          fs.writeFileSync(stagePath, bytes);
          job.files.push(stagePath);

          if (job.status === 'cancelled') {
            return res.json({ success: false, error: 'המשימה בוטלה לפני ההרצה.', data: { jobId: job.id } });
          }

          job.status = 'installing';
          // ארגומנטים כמערך, בלי shell. המשתמש יכול לבקש התקנה שקטה.
          const args = Array.isArray(params.args) ? params.args.map(String) : [];

          // msi אינו קובץ הרצה. הרצה ישירה שלו נכשלת ב-spawn EFTYPE, ולכן
          // הוא מועבר ל-msiexec. exe רץ כמו שהוא.
          const isMsi = path.extname(stagePath).toLowerCase() === '.msi';
          const cmd = isMsi ? 'msiexec.exe' : stagePath;
          const cmdArgs = isMsi ? ['/i', stagePath, ...args] : args;

          job.child = execFile(cmd, cmdArgs, { windowsHide: false }, (err) => {
            job.status = err ? 'failed' : 'done';
            job.error = err ? err.message : null;
          });

          return res.json({
            success: true,
            data: {
              jobId: job.id,
              path: stagePath,
              bytes: bytes.length,
              from: iurl.href,
              status: 'installing',
              message: 'המתקין הורד והופעל. אפשר לבטל מהפאנל - ביטול יעצור אותו וימחק את מה שהורד.'
            }
          });
        } catch (e) {
          job.status = 'failed';
          job.error = e.message;
          // ניקוי מיידי: קובץ חלקי ממקור חיצוני לא צריך להישאר על הדיסק.
          cancelInstallJob(job.id);
          const aborted = e && e.name === 'AbortError';
          return res.json({
            success: false,
            error: aborted ? 'ההורדה בוטלה.' : `ההתקנה נכשלה: ${e.message}`,
            data: { jobId: job.id }
          });
        }
      }

      // הורדת קובץ מהאינטרנט אל התיקייה המורשית.
      //
      // כתיבה, ולכן היא כפופה להרשאת הכתיבה ולתחום הכתיבה - לא לתחום הקריאה
      // הרחב. הורדה יכולה להגיע לכל מקום ברשת, אבל הקובץ נוחת רק במקום אחד.
      case 'download_file': {
        if (!perms.writeFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת כתיבת קבצים כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.url) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר url להורדה' });
        }

        let url;
        try { url = new URL(String(params.url)); } catch (e) {
          return res.status(400).json({ success: false, error: 'כתובת לא תקינה.' });
        }
        // רק http/https. file: היה קורא מהדיסק המקומי ועוקף את תחום הקריאה.
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return res.status(400).json({ success: false, error: 'רק כתובות http ו-https נתמכות.' });
        }

        // שם הקובץ נגזר מהכתובת אם לא נשלח, ותמיד עובר basename כדי ששרת
        // מרוחק לא יוכל לקבוע נתיב באמצעות שם עם לוכסנים.
        const suggested = params.filename ||
          decodeURIComponent(url.pathname.split('/').pop() || '') || 'download';
        const safeName = path.basename(String(suggested)).replace(/[<>:"|?*]/g, '_') || 'download';
        const destDir = validatePathInScope(params.path || perms.allowedPath || '.');
        const dest = validatePathInScope(path.join(destDir, safeName));

        if (fs.existsSync(dest) && !params.overwrite) {
          return res.status(409).json({ success: false, error: `הקובץ כבר קיים: ${dest}. הוסף overwrite=true כדי לדרוס.` });
        }

        const MAX_BYTES = Number(process.env.WIN_DOWNLOAD_MAX_BYTES) || 200 * 1024 * 1024;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120000);
          const resp = await fetch(url, { signal: controller.signal, redirect: 'follow' });
          clearTimeout(timer);

          if (!resp.ok) {
            return res.json({ success: false, error: `ההורדה נכשלה: ${resp.status} ${resp.statusText}` });
          }

          // בודקים את הגודל המוצהר לפני שמורידים, וגם את בפועל אחרי - כותרת
          // יכולה לשקר או להיעדר.
          const declared = Number(resp.headers.get('content-length') || 0);
          if (declared && declared > MAX_BYTES) {
            return res.json({ success: false, error: `הקובץ גדול מהמותר (${Math.round(declared / 1048576)}MB).` });
          }

          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length > MAX_BYTES) {
            return res.json({ success: false, error: `הקובץ גדול מהמותר (${Math.round(buf.length / 1048576)}MB).` });
          }

          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, buf);
          return res.json({
            success: true,
            data: {
              path: dest,
              bytes: buf.length,
              contentType: resp.headers.get('content-type') || null,
              from: url.href
            }
          });
        } catch (e) {
          const aborted = e && e.name === 'AbortError';
          return res.json({
            success: false,
            error: aborted ? 'ההורדה בוטלה לאחר שתי דקות ללא סיום.' : `ההורדה נכשלה: ${e.message}`
          });
        }
      }

      case 'read_file': {
        if (!perms.readFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת קריאת קבצים (WIN_PERM_READ) כבויה בשרת.' });
        }
        if (!params.path) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר path של הקובץ לקריאה' });
        }
        const filePath = validatePathInScope(params.path, 'read');
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, error: `הקובץ אינו קיים: ${params.path}` });
        }
        // לפי סוג הקובץ ולא כאילו הכול טקסט. PDF ו-Word מומרים לטקסט,
        // וקובץ בינארי מדווח ככזה במקום להישפך כג'יבריש שהמודל מנסה לפרש.
        const smart = await readSmart(filePath);
        const content = smart.text;

        if (smart.kind === 'binary' || (!content && smart.note)) {
          return res.json({
            success: true,
            data: {
              path: params.path,
              kind: smart.kind,
              totalChars: 0,
              returned: 0,
              hasMore: false,
              content: '',
              note: smart.note
            }
          });
        }

        // חלון קריאה נשלט במקום חיתוך קבוע ב-50k. קובץ גדול נקרא בקטעים
        // רצופים במקום להיחתך בשקט באמצע.
        const rfOffset = Math.max(0, Number(params.offset) || 0);
        const rfLimit = Math.min(Math.max(1, Number(params.limit) || 50000), 200000);
        const slice = content.slice(rfOffset, rfOffset + rfLimit);

        return res.json({
          success: true,
          data: {
            path: params.path,
            kind: smart.kind,
            meta: smart.meta,
            totalChars: content.length,
            offset: rfOffset,
            returned: slice.length,
            hasMore: rfOffset + slice.length < content.length,
            content: slice
          }
        });
      }

      // 2. רשימת קבצים בתיקייה
      case 'list_directory': {
        if (!perms.readFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת קריאת קבצים ותיקיות (WIN_PERM_READ) כבויה בשרת.' });
        }
        const dirPath = validatePathInScope(params.path || perms.readPath || perms.allowedPath || process.cwd(), 'read');
        if (!fs.existsSync(dirPath)) {
          return res.status(404).json({ success: false, error: `התיקייה אינה קיימת: ${params.path}` });
        }
        const all = fs.readdirSync(dirPath, { withFileTypes: true }).map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          path: path.join(dirPath, item.name)
        }));

        // עימוד במקום חיתוך שקט. קודם הוחזרו 100 פריטים בלי שום סימן שיש עוד,
        // כך שהמודל עבד על תמונה חלקית בלי לדעת את זה.
        const lsOffset = Math.max(0, Number(params.offset) || 0);
        const lsLimit = Math.min(Math.max(1, Number(params.limit) || 200), 1000);
        const lsPage = all.slice(lsOffset, lsOffset + lsLimit);

        return res.json({
          success: true,
          data: {
            directory: dirPath,
            total: all.length,
            offset: lsOffset,
            limit: lsLimit,
            returned: lsPage.length,
            hasMore: lsOffset + lsPage.length < all.length,
            items: lsPage
          }
        });
      }

      // 3. כתיבה או יצירת קובץ
      case 'write_file': {
        if (!perms.writeFiles) {
          return res.status(403).json({ success: false, error: 'הרשאת כתיבת ועריכת קבצים כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.path || typeof params.content !== 'string') {
          return res.status(400).json({ success: false, error: 'חסרים פרמטרי path או content לכתיבה' });
        }
        const filePath = validatePathInScope(params.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, params.content, 'utf8');
        return res.json({ success: true, data: { message: `הקובץ נשמר בהצלחה בנתיב: ${filePath}`, bytes: Buffer.byteLength(params.content, 'utf8') } });
      }

      // 4. הרצת פקודת PowerShell / CMD
      case 'run_command': {
        if (!perms.runCommands) {
          return res.status(403).json({ success: false, error: 'הרשאת הרצת פקודות מערכת כבויה בהגדרות התוסף או השרת.' });
        }
        if (!params.command) {
          return res.status(400).json({ success: false, error: 'חסר פרמטר command להרצה' });
        }
        checkDangerousWindowsCommands(params.command);

        const cwd = perms.allowedPath || process.cwd();
        // execFile ולא exec: Node לא פותח shell שמפרסר את המחרוזת בעצמו.
        // -NoProfile קריטי - בלעדיו PowerShell טוען את הפרופיל של המשתמש לפני
        // כל פקודה, כך שכל מי שיכול לכתוב לקובץ הפרופיל מריץ קוד בכל קריאה.
        execFile('powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', params.command],
          { cwd, timeout: commandTimeoutMs(), maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
          if (error) {
            return res.json({
              success: false,
              error: error.message,
              stderr: stderr ? stderr.toString() : null,
              stdout: stdout ? stdout.toString() : null
            });
          }
          return res.json({
            success: true,
            data: {
              stdout: (stdout || '').toString().slice(0, 30000),
              stderr: (stderr || '').toString().slice(0, 10000),
              cwd: cwd
            }
          });
        });
        return;
      }

      // 5. פתיחת אפליקציה
      case 'open_app': {
        if (!perms.launchApps) {
          return res.status(403).json({ success: false, error: 'הרשאת הפעלת תוכנות (WIN_PERM_APPS) כבויה בשרת.' });
        }
        if (!params.app_name && !params.path) {
          return res.status(400).json({ success: false, error: 'חסר שם אפליקציה או נתיב להרצה (app_name)' });
        }
        
        let appTarget = (params.path || params.app_name || '').trim();
        const appLow = appTarget.toLowerCase().replace(/['"״]/g, '');

        const appAliases = {
          // AI & Chat
          'claude': 'https://claude.ai/new',
          'קלוד': 'https://claude.ai/new',
          'chatgpt': 'chatgpt',
          'gpt': 'chatgpt',
          'גפט': 'chatgpt',
          // Productivity & Code
          'vscode': 'code',
          'code': 'code',
          'קוד': 'code',
          'cursor': 'cursor',
          'קראוסר': 'cursor',
          'visual studio': 'devenv',
          'notepad': 'notepad',
          'פנקס רשימות': 'notepad',
          'word': 'winword',
          'וורד': 'winword',
          'winword': 'winword',
          'excel': 'excel',
          'אקסל': 'excel',
          'powerpoint': 'powerpnt',
          'פאוורפוינט': 'powerpnt',
          'notion': 'notion:',
          'נושן': 'notion:',
          'figma': 'figma:',
          'פיגמה': 'figma:',
          // Communication
          'whatsapp': 'whatsapp:',
          'ווטסאפ': 'whatsapp:',
          'וואטסאפ': 'whatsapp:',
          'telegram': 'telegram:',
          'טלגרם': 'telegram:',
          'discord': 'discord:',
          'דיסקורד': 'discord:',
          'slack': 'slack:',
          'סלאק': 'slack:',
          'teams': 'msteams:',
          'טימס': 'msteams:',
          // Media & Utilities
          'spotify': 'spotify:',
          'ספוטיפיי': 'spotify:',
          'calc': 'calculator:',
          'calculator': 'calculator:',
          'מחשבון': 'calculator:',
          'paint': 'mspaint',
          'צייר': 'mspaint',
          'camera': 'microsoft.windows.camera:',
          'מצלמה': 'microsoft.windows.camera:',
          'explorer': 'explorer',
          'סייר הקבצים': 'explorer',
          'settings': 'ms-settings:',
          'הגדרות': 'ms-settings:',
          'clock': 'ms-clock:',
          'שעון': 'ms-clock:',
          'store': 'ms-windows-store:',
          'חנות': 'ms-windows-store:',
          'taskmgr': 'taskmgr',
          'מנהל המשימות': 'taskmgr',
          'cmd': 'cmd',
          'powershell': 'powershell',
          'terminal': 'wt',
          'טרמינל': 'wt',
          // Browsers
          'chrome': 'chrome',
          'כרום': 'chrome',
          'edge': 'msedge',
          'אדג': 'msedge',
          'brave': 'brave',
          'firefox': 'firefox'
        };

        let targetToRun = appAliases[appLow] || appTarget;

        // הרצה ישירה דרך cmd /c start המקפיצה מיד כל פרוטוקול/תוכנה בשולחן העבודה
        const targetCommand = targetToRun.includes(':') 
          ? `start "" "${targetToRun}"` 
          : `start "" ${targetToRun}`;

        // start מחזירה תמיד קוד יציאה 0, ולכן היא אינה עדות לכך שמשהו באמת נפתח.
        // גרוע מכך - יעד שאינו קיים תוקע את cmd בהמתנה לדיאלוג שגיאה, והבקשה
        // לעולם לא חוזרת בעוד תהליך cmd נשאר תלוי. לכן בודקים מראש שהיעד קיים,
        // ומגבילים כל הרצה בזמן כרשת ביטחון.
        const LAUNCH_TIMEOUT_MS = 5000;

        const reportLaunched = () =>
          res.json({ success: true, data: { message: `היישום '${appTarget}' הופעל בהצלחה ב-Windows!` } });

        // היעד מגיע בסופו של דבר מפלט של מודל, ולכן חייב לעבור אימות תווים לפני
        // שהוא נוגע ב-cmd. תו כמו & או | היה הופך פתיחת תוכנה להרצת פקודה שרירותית.
        const SAFE_EXE = /^[A-Za-z0-9._-]+$/;
        const SAFE_URI = /^[A-Za-z][A-Za-z0-9.+-]*:[^"'`|&;<>^%\r\n]*$/;

        // explicit הוא יעד שכבר אותר במחשב: נתיב מהרישום, קיצור מתפריט התחל
        // או AppID של אפליקציית Store. הוא אינו עובר את בדיקת התווים כי הוא
        // לא הגיע מהמודל אלא מ-Windows עצמו, ונתיבים אמיתיים מכילים רווחים.
        const launchTarget = (explicit) => {
          const runTarget = explicit || targetToRun;
          // execFile ולא exec - הארגומנטים מועברים כמערך ואינם עוברים פירוש shell
          execFile('cmd.exe', ['/c', 'start', '', runTarget],
            { windowsHide: false, timeout: LAUNCH_TIMEOUT_MS, killSignal: 'SIGKILL' }, (cmdErr) => {
            if (!cmdErr) {
              return reportLaunched();
            }

            if (cmdErr.killed) {
              return res.status(504).json({
                success: false,
                error: `פתיחת '${appTarget}' לא הסתיימה בזמן ובוטלה. ייתכן שממתין לך דיאלוג על המסך.`
              });
            }

            // Fallback ל-PowerShell במידה ו-cmd start נכשל
            execFile('powershell.exe',
              ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Start-Process "${runTarget}"`],
              { timeout: LAUNCH_TIMEOUT_MS, killSignal: 'SIGKILL' },
              (psErr) => {
                if (psErr) {
                  const reason = psErr.killed ? 'היעד לא הגיב בזמן' : psErr.message;
                  return res.status(500).json({ success: false, error: `שגיאה בפתיחת ${appTarget}: ${reason}` });
                }
                return reportLaunched();
              });
          });
        };

        const stripExe = (v) => {
          const t = String(v).toLowerCase();
          return t.endsWith('.exe') ? t.slice(0, -4) : t;
        };

        // חיפוש התוכנה במקומות שבהם Windows באמת רושם תוכנות, אחרי ש-PATH
        // או בדיקת התווים לא הספיקו. השם מועבר לסקריפט דרך משתנה סביבה
        // ומשמש שם כתבנית -like בלבד, ולכן אינו יכול לגעת ב-shell.
        const resolveAndLaunch = async (notFoundHint) => {
          const candidates = await resolveAppCandidates(appTarget);
          if (!candidates.length) {
            return res.status(404).json({ success: false, error: notFoundHint });
          }

          // התאמה מדויקת אחת ויחידה היא החלטה, לא ניחוש, ולכן נפתחת מיד.
          // יותר מאחת - למשל notepad שמחזיר גם Notepad וגם Notepad++ - היא
          // בדיוק המקרה שבו בחירה שקטה תפתח את התוכנה הלא נכונה.
          const wanted = stripExe(appLow);
          const exact = candidates.filter((c) => stripExe(c.label) === wanted);

          // התאמה מדויקת מופיעה בדרך כלל שלוש פעמים לאותה תוכנה: הרשומה
          // ברישום, הקיצור בתפריט התחל ורשומת ה-Store. זו אינה עמימות אלא
          // אותו יעד משלושה מקורות, ולכן נבחר המדויק שבהם - נתיב מלא עדיף
          // על קיצור, וקיצור עדיף על AppID. עמימות אמיתית היא רק כשנשארות
          // כמה התאמות מדויקות מאותו סוג, כלומר שתי תוכנות שונות באמת.
          const ORDER = ['app-path', 'shortcut', 'store'];
          let best = exact;
          for (const type of ORDER) {
            const tier = exact.filter((c) => c.type === type);
            if (tier.length) { best = tier; break; }
          }

          const pick = best.length === 1 ? best[0]
                     : (candidates.length === 1 ? candidates[0] : null);

          if (pick) return launchTarget(pick.target);

          return res.status(409).json({
            success: false,
            error: `'${appTarget}' לא נפתח ישירות, אבל נמצאו ${candidates.length} התאמות במחשב. ` +
                   'בחר אחת והפעל שוב את open_app עם הערך המדויק בשדה path.',
            data: { candidates }
          });
        };

        // שם שנופל בבדיקת התווים אינו בהכרח שם פסול: "Notepad++", "Google
        // Chrome" ושמות בעברית נופלים בה כולם. מה שאסור הוא רק להעביר אותו
        // כפי שהוא ל-cmd. לכן במקום לדחות, מחפשים אותו במחשב ומפעילים יעד
        // מאומת שחזר מ-Windows עצמו - נתיב מהרישום או AppID של אפליקציה.
        // ההבחנה כאן היא בין שם שנפסל כי הוא לא בטוח לבין שם שנפסל כי הוא
        // פשוט לא ASCII. "Notepad++" ו-"Google Chrome" הם שמות לגיטימיים
        // שנופלים בבדיקה, ואותם כדאי לחפש. שם שמכיל & או | או גרש הפוך אינו
        // שם של תוכנה אלא ניסיון הזרקה, והוא נדחה מיד ובקול - גם אם בפועל
        // הוא כבר לא היה מגיע ל-cmd, כי רק יעד מאומת מ-Windows מופעל.
        // התווים: & | ; ` $ < > ^ " ' ופסיק-נקודה, לצד תווי בקרה.
        const SHELL_META = [38, 124, 59, 96, 36, 60, 62, 94, 34, 39]
          .map((c) => String.fromCharCode(c));
        const looksHostile = Array.from(appTarget)
          .some((ch) => SHELL_META.includes(ch) || ch.charCodeAt(0) < 32);
        if (!SAFE_EXE.test(targetToRun) && !SAFE_URI.test(targetToRun)) {
          if (looksHostile || appTarget.length > 120) {
            return res.status(400).json({
              success: false,
              error: `שם היישום '${appTarget}' מכיל תווים שאינם מורשים.`
            });
          }
          await resolveAndLaunch(
            `היישום '${appTarget}' אינו ניתן להרצה ישירה, ולא נמצאה לו התאמה מותקנת במחשב.`
          );
          return;
        }

        if (targetToRun.includes(':')) {
          // פרוטוקול: קיים רק אם ה-scheme רשום ב-Registry
          const scheme = targetToRun.split(':')[0];
          execFile('reg.exe', ['query', `HKCR\\${scheme}`, '/ve'], { timeout: LAUNCH_TIMEOUT_MS }, (regErr) => {
            if (regErr) {
              return res.status(404).json({
                success: false,
                error: `היישום '${appTarget}' אינו מותקן במחשב (הפרוטוקול '${scheme}:' אינו רשום).`
              });
            }
            launchTarget();
          });
        } else {
          // קובץ הרצה. where.exe בודק PATH בלבד, ורוב התוכנות במחשב אינן שם:
          // כרום, Office, ספוטיפיי ואפליקציות Store לא רושמות את עצמן ב-PATH.
          // לכן כשלון של where אינו "לא מותקן" אלא רק "לא ב-PATH", וממשיכים
          // לחפש במקומות שבהם Windows באמת רושם תוכנות.
          execFile('where.exe', [targetToRun], { timeout: LAUNCH_TIMEOUT_MS }, async (whereErr) => {
            if (!whereErr) return launchTarget();
            await resolveAndLaunch(
              `היישום '${appTarget}' לא נמצא במחשב. חיפשתי ב-PATH, ` +
              'ברישום (App Paths), בקיצורים של תפריט התחל ובאפליקציות Store.'
            );
          });
        }
        return;
      }

      // GitHub דרך ה-CLI שכבר מאומת במחשב.
      //
      // הטוקן של התוסף מוגבל להרשאות שניתנו לו פעם, ופעולות כמו מחיקת
      // מאגר פשוט נדחות בו. gh כבר מחובר עם החשבון האמיתי, ולכן זה גם
      // עובד וגם חוסך ניהול של טוקן שני.
      case 'github_cli': {
        if (!perms.githubCli) {
          return res.status(403).json({
            success: false,
            error: 'הרשאת GitHub דרך המחשב (WIN_PERM_GITHUB_CLI) כבויה בהגדרות.'
          });
        }
        const ghArgs = Array.isArray(params.args) ? params.args : null;
        if (!ghArgs) {
          return res.status(400).json({
            success: false,
            error: 'חסר args - מערך של ארגומנטים ל-gh. לדוגמה: ["repo", "list"]'
          });
        }
        try {
          const out = await runGh(ghArgs, params.cwd);
          auditLog('github_cli', { args: ghArgs }, 'success', out.readOnly ? 'read' : 'write');
          return res.json({ success: true, data: out });
        } catch (e) {
          auditLog('github_cli', { args: ghArgs }, 'denied', e.message);
          return res.status(e.status || 500).json({ success: false, error: e.message });
        }
      }

      // 6. פעולות קבצים נוספות: העתקה, העברה, מחיקה לסל, יצירת תיקייה, חיפוש
      case 'make_dir':
      case 'copy_file':
      case 'move_file':
      case 'delete_file':
      case 'find_files': {
        const fileActions = createFileActions({ validatePathInScope, perms });
        try {
          const data = await fileActions[action](params);
          return res.json({ success: true, data });
        } catch (e) {
          return res.status(e.status || 500).json({ success: false, error: e.message });
        }
      }

      // 7. קריאה או כתיבה ללוח (Clipboard)
      case 'clipboard_read': {
        if (!perms.clipboard) {
          return res.status(403).json({ success: false, error: 'הרשאת גישה ללוח (WIN_PERM_CLIPBOARD) כבויה בשרת.' });
        }
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'], (error, stdout) => {
          if (error) {
            return res.status(500).json({ success: false, error: error.message });
          }
          return res.json({ success: true, data: { clipboard_content: (stdout || '').trim() } });
        });
        return;
      }

      case 'clipboard_write': {
        if (!perms.clipboard) {
          return res.status(403).json({ success: false, error: 'הרשאת גישה ללוח (WIN_PERM_CLIPBOARD) כבויה בשרת.' });
        }
        const textToCopy = params.text || '';
        const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'], (error) => {
          if (error) {
            return res.status(500).json({ success: false, error: error.message });
          }
          return res.json({ success: true, data: { message: 'הטקסט הועתק ללוח של Windows בהצלחה!' } });
        });
        if (child.stdin) {
          child.stdin.end(textToCopy, 'utf8');
        }
        return;
      }

      default:
        return res.status(400).json({
          success: false,
          error: `פעולה לא מוכרת ב-Windows MCP: '${action}'. פעולות אפשריות: read_file, write_file, list_directory, run_command, open_app, clipboard_read, clipboard_write, github_cli.`
        });
    }
  } catch (err) {
    console.error('[Windows MCP Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { handleWindowsExecute };
