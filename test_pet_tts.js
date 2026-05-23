async function testTts() {
  console.log('Sending request to /api/pet/tts...');
  try {
    const res = await fetch('http://localhost:3000/api/pet/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Olá! Tudo bem por aqui, obrigado por perguntar.',
        voice: 'pm_alex',
        lang: 'pt-BR'
      })
    });
    console.log('Status Code:', res.status);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      console.log('Buffer length:', buffer.byteLength);
    } else {
      const text = await res.text();
      console.log('Response text:', text);
    }
  } catch (err) {
    console.error('Fetch error:', err.stack || err.message);
  }
}

testTts();
