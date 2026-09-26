const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const apiKey = 'gem_live_sk_76bb66a9a2c8a9d74c353c90bf785750';

console.log('🚀 1. מפעיל את שרת ה-Bridge...');
const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'bridge-server', 'server.js')], {
  cwd: path.join(__dirname, '..', 'bridge-server'),
  stdio: ['ignore', 'pipe', 'pipe']
});

serverProc.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.includes('running') || s.includes('מאזין') || s.includes('http')) {
    console.log('[שרת]:', s.trim());
  }
});

serverProc.stderr.on('data', (d) => {
  console.error('[שגיאת שרת]:', d.toString().trim());
});

// המתנה קצרה לעליית השרת
setTimeout(() => {
  console.log('\n📡 2. שולח שאילתת API ל-POST http://127.0.0.1:3000/v1/chat/completions...');
  console.log('🔑 מפתח API:', apiKey);
  console.log('💬 פרומפט: "ספר בדיחה קצרה וטובה על מתכנתים בעברית"\n');

  const payload = JSON.stringify({
    model: 'gemini-2.0-flash',
    messages: [
      { role: 'user', content: 'ספר בדיחה קצרה וטובה על מתכנתים בעברית (משפט אחד או שניים).' }
    ],
    stream: false
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log(`\n🎉 3. התקבלה תשובה מלאה מה-API! (HTTP Status: ${res.statusCode})`);
      try {
        const data = JSON.parse(body);
        console.log('\n================== תוצאת ה-API ==================');
        console.log(JSON.stringify(data, null, 2));
        console.log('==================================================');
        if (data.choices && data.choices[0]) {
          console.log('\n✨ תוכן התשובה שג\'מיני החזיר:');
          console.log('--------------------------------------------------');
          console.log(data.choices[0].message.content);
          console.log('--------------------------------------------------\n');
        }
      } catch (e) {
        console.log('תגובה:', body);
      }
      serverProc.kill();
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('❌ שגיאת בקשה:', err.message);
    serverProc.kill();
    process.exit(1);
  });

  req.write(payload);
  req.end();
}, 2000);
