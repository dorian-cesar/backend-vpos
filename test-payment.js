async function test() {
  const data = {
    shopProcessId: Math.floor(Math.random() * 100000),
    amount: 15000,
    currency: 'PYG',
    description: 'Prueba de integracion',
    additionalData: 'Test 001'
  };

  try {
    const res = await fetch('http://localhost:3000/api/bancard/single-buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const body = await res.json();
    console.log(`Status de tu backend: ${res.status}`);
    console.log('Cuerpo de la respuesta:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
