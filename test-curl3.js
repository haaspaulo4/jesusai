const http = require('http');

const data = JSON.stringify({ message: '/meta', personaId: 'jesus', language: 'pt-BR' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/pet/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', d => body += d.toString());
  res.on('end', () => console.log('BODY:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
