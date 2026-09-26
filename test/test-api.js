const http = require('http');

const apiKey = 'gem_live_sk_76bb66a9a2c8a9d74c353c90bf785750';

const payload = JSON.stringify({
  model: 'gemini-2.0-flash',
  messages: [
    { role: 'user', content: 'What is 10 + 25? Answer with only the number.' }
  ],
  stream: false
});

console.log('📡 שולח בקשת בדיקה לשרת המקומי: POST http://127.0.0.1:3000/v1/chat/completions...');
console.log('🔑 מפתח API מאומת:', apiKey);

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
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('📊 Status Code:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log('📦 תשובה מפורמטת שהתקבלה מה-API:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('📄 Raw Response Body:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ שגיאת חיבור לשרת:', e.message);
});

req.write(payload);
req.end();
