document.addEventListener('DOMContentLoaded', () => {
  const payButton = document.getElementById('pay-button');
  const productInfo = document.getElementById('product-info');
  const loader = document.getElementById('loader');
  const iframeContainer = document.getElementById('iframe-container');
  const successMessage = document.getElementById('success-message');

  // Estilos nativos para inyectar en el iframe de Bancard (Vpos 2.0)
  // Adaptado al dark theme y estética glassmorphism
  const bancardStyles = {
    "form-background-color": "#1e293b",
    "button-background-color": "#6366f1",
    "button-text-color": "#ffffff",
    "button-border-color": "#6366f1",
    "input-background-color": "#0f172a",
    "input-text-color": "#f8fafc",
    "input-placeholder-color": "#64748b",
    "color-label": "#94a3b8"
  };

  payButton.addEventListener('click', async () => {
    // 1. Mostrar estado de carga
    productInfo.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
      // 2. Solicitar un "Single Buy" a nuestro backend
      const response = await fetch('http://localhost:3000/api/bancard/single-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopProcessId: Math.floor(Math.random() * 1000000), // Generar un ID unico de orden
          amount: 15000,
          currency: 'PYG',
          description: 'Suscripción Premium 1 Año',
          additionalData: 'Cliente VIP'
        })
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || 'Error al iniciar el pago');
      }

      // 3. Obtener el processId provisto por Bancard (o el Mock)
      const processId = data.data.processId;
      console.log('✅ Compra iniciada. Process ID:', processId);

      // 4. Preparar la vista
      loader.classList.add('hidden');
      iframeContainer.classList.remove('hidden');

      // 5. Levantar el Iframe de Bancard usando la librería
      if (typeof Bancard !== 'undefined' && Bancard.Checkout) {
        Bancard.Checkout.createForm('iframe-container', processId, bancardStyles);
        
        // Simulación: Si es el mock (que genera processId de la forma mock_process_...),
        // mostramos un botón para forzar el éxito (ya que el iframe real fallará)
        if (processId.startsWith('mock_')) {
          renderMockSimulator();
        }
      } else {
        throw new Error('La librería de Bancard no se pudo cargar.');
      }

    } catch (error) {
      console.error(error);
      alert('Hubo un problema al iniciar el pago: ' + error.message);
      
      // Restaurar vista
      loader.classList.add('hidden');
      productInfo.classList.remove('hidden');
    }
  });

  /**
   * Como en entorno "Mock" el Process ID es inventado, el Iframe real de Bancard
   * dará error. Renderizamos un botón "Simular Pago Exitoso" debajo para
   * poder probar la pantalla de éxito.
   */
  function renderMockSimulator() {
    const mockWarning = document.createElement('div');
    mockWarning.style.marginTop = '20px';
    mockWarning.style.textAlign = 'center';
    mockWarning.style.padding = '15px';
    mockWarning.style.background = 'rgba(234, 179, 8, 0.1)';
    mockWarning.style.color = '#facc15';
    mockWarning.style.borderRadius = '12px';
    mockWarning.style.fontSize = '0.9rem';

    mockWarning.innerHTML = `
      <p style="margin-bottom: 10px;">⚠️ <strong>Modo Mock Activo</strong></p>
      <p style="margin-bottom: 15px; color: #a1a1aa">El iframe fallará porque las credenciales son falsas. Haz clic abajo para simular que el cliente completó el pago.</p>
      <button class="btn-primary" style="background: #eab308; box-shadow: none;" id="force-success-btn">Forzar Pago Exitoso</button>
    `;
    
    iframeContainer.parentNode.insertBefore(mockWarning, iframeContainer.nextSibling);

    document.getElementById('force-success-btn').addEventListener('click', () => {
      iframeContainer.classList.add('hidden');
      mockWarning.classList.add('hidden');
      successMessage.classList.remove('hidden');
    });
  }
});
