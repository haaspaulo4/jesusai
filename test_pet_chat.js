async function testChat() {
  console.log('Sending request to /api/pet/chat...');
  try {
    const res = await fetch('http://localhost:3000/api/pet/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Oi, tudo bem?',
        language: 'pt-BR',
        personaId: 'jarvis'
      })
    });
    console.log('Status Code:', res.status);
    const json = await res.json();
    console.log('Response JSON:', json);
  } catch (err) {
    console.error('Fetch error:', err.stack || err.message);
  }
}

testChat();
