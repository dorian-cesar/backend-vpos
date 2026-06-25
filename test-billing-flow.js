import dns from 'dns';
// Asegurar que use ipv4 preferentemente para localhost en entornos que resuelven ipv6
dns.setDefaultResultOrder('ipv4first');

const PORT = process.env.PORT || '3002';
const API_URL = `http://localhost:${PORT}/api/pagosimple`;

async function runBillingTest() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 INICIANDO PRUEBA DE FLUJO COMPLETO: SINGLE-BUY CON FACTURACIÓN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const externalId = `TEST-${Date.now()}`;
  
  const payload = {
    action: 'single-buy',
    servicio: 'Script de Prueba Facturacion',
    canal: 'web',
    id: externalId,
    amount: 15000,
    currency: 'PYG',
    description: 'Compra de prueba con Factura Electronica',
    returnUrl: 'https://wit-bancard.dev-wit.com/api/bancard/success',
    cancelUrl: 'https://wit-bancard.dev-wit.com/api/bancard/cancel',
    billing: {
      client_ruc: '80000000-1',
      client_name: 'Contribuyente de Prueba SA',
      client_email: 'contribuyente.prueba@example.com',
      details: [
        {
          description: 'Item de Prueba Facturacion 10 IVA',
          amount: '15000.00',
          iva_rate: 10,
          total_items: 1
        }
      ]
    }
  };

  console.log('1. Enviando payload al Gateway unificado...');
  console.log('   URL del API:', API_URL);
  console.log('   Payload enviado:\n', JSON.stringify(payload, null, 2));
  console.log('--------------------------------------------------------------');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log(`2. Respuesta recibida (HTTP ${response.status}):`);
    console.log('\n', JSON.stringify(data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (response.status === 200 && data.status === 'success') {
      console.log('✅ PRUEBA EXITOSA: Compra iniciada en Bancard.');
      console.log('\n👉 PASOS A SEGUIR PARA PROBAR LA CANCELACIÓN:');
      console.log('1. Copia y pega la siguiente URL en tu navegador para realizar el pago de prueba:');
      console.log(`   🔗 ${data.data.iframeUrl}`);
      console.log('\n2. Utiliza una tarjeta de prueba de Bancard (ej. Visa Crédito Staging) para completar el pago.');
      console.log('\n3. Una vez pagado, Bancard enviará de forma asíncrona la confirmación al webhook, emitiendo la factura.');
      console.log(`\n4. Para verificar la confirmación y obtener el número de factura, consulta:`);
      console.log(`   GET http://localhost:${PORT}/api/bancard/confirmation/${data.data.shopProcessId}`);
      console.log('\n5. Finalmente, para probar la anulación/cancelación de la factura, haz un POST a:');
      console.log(`   POST http://localhost:${PORT}/api/bancard/cancel-billing`);
      console.log(`   Con el cuerpo:`);
      console.log(JSON.stringify({ shopProcessId: data.data.shopProcessId }, null, 2));
    } else {
      console.error('❌ ERROR: El backend retornó un estado fallido o error de comunicación.');
    }
  } catch (error) {
    console.error('❌ ERROR AL REALIZAR LA PETICIÓN:', error.message);
    console.log('\n💡 Asegúrate de que tu servidor backend esté corriendo en el puerto', PORT);
    console.log('   Puedes iniciarlo ejecutando: npm run dev');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runBillingTest();
