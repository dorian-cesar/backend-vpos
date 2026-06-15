/**
 * shopProcessIdGenerator.ts
 * Generación centralizada del shopProcessId en el servidor.
 *
 * El shopProcessId es un identificador numérico único por transacción que
 * Bancard usa para asociar la operación. Su generación DEBE ocurrir en el
 * backend para garantizar unicidad y evitar manipulación desde el cliente.
 *
 * Formato: [22][timestamp 8 dígitos][random 5 dígitos] = 15 dígitos
 *
 * Ejemplo:
 *   timestamp epoch (ms) = 1718462800123 → slice(-8) = "00123"  (8 dígitos)
 *   random = 47823
 *   resultado: 22 + 46280012 + 47823 = 224628001247823
 */

/**
 * Genera un shopProcessId único y seguro para una nueva transacción.
 * @returns Número entero de 15 dígitos único por sesión.
 */
export function generateShopProcessId(): number {
  const PREFIX = '22'; // 2 dígitos fijos de prefijo del comercio

  // Últimos 8 dígitos del timestamp en milisegundos (cicla cada ~11.5 días,
  // combinado con el sufijo random la probabilidad de colisión es despreciable)
  const timestamp = Date.now().toString().slice(-8);

  // Sufijo random de 5 dígitos (00000–99999)
  const randomPart = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0');

  const shopProcessIdStr = PREFIX + timestamp + randomPart;
  return parseInt(shopProcessIdStr, 10);
}
