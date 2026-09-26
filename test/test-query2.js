const http = require('http');

const apiKey = 'gem_live_sk_76bb66a9a2c8a9d74c353c90bf785750';

const payload = JSON.stringify({
  model: 'gemini-2.0-flash',
  messages: [
    { role: 'user', content: 'ספר בדיחה קצרה וטובה על מתכנתים בעברית (משפט אחד או שניים).' }
  ],
  stream: false
});

console.log('🚀 שולח שאילתה חדשה לשרת ה-API:');
console.log('שאלה: "ספר בדיחה קצרה וטובה על מתכנתים בעברית"');
console.log('מפתח בשימוש:', apiKey);
console.log('כתובת:', 'http://127.0.0.1:3000/v1/chat/completions\n');

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
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`\n📊 קוד תגובה (Status): ${res.statusCode}`);
    try {
      const data = JSON.parse(body);
      if (data && data.choices && data.choices[0]) {
        console.log('✨ תשובה שהתקבלה:');
        console.log('----------------------------------------');
        console.log(data.choices[0].message.content);
        console.log('----------------------------------------');
      } else {
        console.log('תוכן התגובה:', JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.log('תגובה גולמית:', body);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ שגיאת חיבור:', err.message);
});

req.write(payload);
req.end();
