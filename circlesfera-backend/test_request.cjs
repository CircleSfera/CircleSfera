const http = require('http');

http.get('http://127.0.0.1:3005/api/v1/auth/login', (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Body:', data);
  });
}).on('error', (e) => {
  console.error('Request error:', e.message);
});
