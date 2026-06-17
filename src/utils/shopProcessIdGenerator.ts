/**
 * shopProcessIdGenerator.ts
 * Genera un ID único para la transacción que se envía a Bancard en `shop_process_id`.
 *
 * Bancard requiere un entero numérico (hasta 15 dígitos).
 * Implementación de Contador Cíclico sin Cero (Efecto Odómetro) del 1 al 9.
 *
 * Formato: [Prefijo 1 dígito][Odómetro 14 dígitos] = 15 dígitos
 * Prefijo: 1 (web), 2 (totem), 3 (puntodeventa/custodia)
 */

// Estado del odómetro (arreglo de 14 dígitos, cada uno del 1 al 9)
// Se inicializa utilizando el tiempo actual para asegurar que tras un reinicio
// del servidor partamos desde un punto más alto, evitando colisiones a largo plazo.
let odometer: number[] = [];

function initOdometer() {
  let q = Date.now() * 10; // Multiplicador para evitar colisiones inmediatas
  const digits: number[] = [];
  while (q > 0) {
    let rem = q % 9;
    if (rem === 0) {
      rem = 9;
      q = Math.floor(q / 9) - 1;
    } else {
      q = Math.floor(q / 9);
    }
    digits.unshift(rem);
  }
  // Asegurar siempre 14 dígitos (rellenamos con 1 a la izquierda si falta)
  while (digits.length < 14) {
    digits.unshift(1);
  }
  // Si excepcionalmente excede 14 dígitos, truncar a los últimos 14
  if (digits.length > 14) {
    odometer = digits.slice(-14);
  } else {
    odometer = digits;
  }
}

// Inicializar el contador al cargar el módulo
initOdometer();

/**
 * Incrementa mecánicamente el odómetro cíclico sin cero (ruedas del 1 al 9).
 * Acarreo circular: Cuando una rueda llega a 9, pasa a 1 y empuja la siguiente.
 */
function incrementOdometer() {
  let carry = true;
  for (let i = odometer.length - 1; i >= 0; i--) {
    if (carry) {
      if (odometer[i] === 9) {
        odometer[i] = 1; // Da la vuelta sin usar cero
        carry = true;    // "Empuja" a la rueda de la izquierda
      } else {
        odometer[i]++;
        carry = false;
      }
    } else {
      break;
    }
  }
}

/**
 * Genera un shopProcessId único aplicando el Efecto Odómetro.
 * @param canal El canal de la transacción para determinar el prefijo.
 * @returns Número entero de 15 dígitos.
 */
export function generateShopProcessId(canal?: string): number {
  // 1. Determinar el prefijo según el canal (1 dígito)
  let prefix = '3'; // Por defecto para puntodeventa, custodia, etc.
  if (canal === 'web') {
    prefix = '1';
  } else if (canal === 'totem') {
    prefix = '2';
  }

  // 2. Incrementar el odómetro 1 a 1
  incrementOdometer();

  // 3. Concatenar prefijo con el odómetro
  const shopProcessIdStr = prefix + odometer.join('');
  return parseInt(shopProcessIdStr, 10);
}
