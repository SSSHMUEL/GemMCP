const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, 'bin');
const CLOUDFLARED_EXE = path.join(BIN_DIR, 'cloudflared.exe');
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

let tunnelProcess = null;
let currentPublicUrl = null;

function getPublicUrl() {
  return currentPublicUrl;
}

function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

function downloadBinary() {
  return new Promise((resolve, reject) => {
    ensureBinDir();
    if (fs.existsSync(CLOUDFLARED_EXE) && fs.statSync(CLOUDFLARED_EXE).size > 1000000) {
      return resolve(CLOUDFLARED_EXE);
    }

    console.log('[Cloudflare Tunnel] מוריד את קובץ ה-Tunnel המאובטח של Cloudflare (פעם אחת בלבד)...');
    
    // הורדה עם מעקב אחר Redirects
    function fetchWithRedirect(url, targetPath) {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      };

      https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchWithRedirect(res.headers.location, targetPath);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`הורדה נכשלה עם קוד: ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(targetPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log('[Cloudflare Tunnel] ההורדה הושלמה בהצלחה ✅');
          resolve(targetPath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(targetPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    }

    fetchWithRedirect(DOWNLOAD_URL, CLOUDFLARED_EXE);
  });
}

async function startTunnel(port = 3000) {
  if (tunnelProcess) {
    return { url: currentPublicUrl, process: tunnelProcess };
  }

  try {
    await downloadBinary();
  } catch (err) {
    console.error('[Cloudflare Tunnel] שגיאה בהורדת cloudflared:', err.message);
    throw err;
  }

  return new Promise((resolve, reject) => {
    console.log(`[Cloudflare Tunnel] פותח מנהרת אינטרנט מאובטחת עבור פורט ${port}...`);
    
    tunnelProcess = spawn(CLOUDFLARED_EXE, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      windowsHide: true
    });

    let resolved = false;

    function handleLog(data) {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        currentPublicUrl = match[0];
        console.log(`\n=======================================================`);
        console.log(`🌍 כתובת אינטרנט ציבורית מאובטחת (HTTPS) זמינה כעת:`);
        console.log(`   ${currentPublicUrl}`);
        console.log(`   OpenAI Base URL: ${currentPublicUrl}/v1`);
        console.log(`=======================================================\n`);
        resolve({ url: currentPublicUrl, process: tunnelProcess });
      }
    }

    tunnelProcess.stdout.on('data', handleLog);
    tunnelProcess.stderr.on('data', handleLog);

    tunnelProcess.on('error', (err) => {
      console.error('[Cloudflare Tunnel] שגיאה בהרצה:', err.message);
      if (!resolved) reject(err);
    });

    tunnelProcess.on('close', (code) => {
      console.log('[Cloudflare Tunnel] המנהרה נסגרה (קוד יציאה:', code, ')');
      tunnelProcess = null;
      currentPublicUrl = null;
    });

    // Timeout אם לא התקבלה כתובת תוך 60 שניות
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('פסק זמן בהמתנה לכתובת מנהרה מ-Cloudflare. בדוק חיבור לאינטרנט.'));
      }
    }, 60000);
  });
}

function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch (e) {}
    tunnelProcess = null;
    currentPublicUrl = null;
  }
}

module.exports = {
  startTunnel,
  stopTunnel,
  getPublicUrl
};
