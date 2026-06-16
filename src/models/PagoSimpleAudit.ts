import { dbPool } from '../config/db.config.js';

export class PagoSimpleAudit {

  /**
   * Crea la tabla unificada de auditoría automáticamente si no existe.
   * Debe llamarse en el arranque del servidor (server.ts).
   */
  static async initTable(): Promise<void> {
    const auditTable = `
      CREATE TABLE IF NOT EXISTS pago_simple_audits (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        action          VARCHAR(50)       DEFAULT NULL COMMENT 'single-buy | rollback | confirmation | charge-back',
        external_id     VARCHAR(255)      DEFAULT NULL COMMENT 'ID externo del frontend (campo id)',
        servicio        VARCHAR(255)      DEFAULT NULL COMMENT 'Nombre del servicio/app origen',
        canal           VARCHAR(255)      DEFAULT NULL COMMENT 'Canal / dispositivo (totem, web, etc.)',
        shop_process_id VARCHAR(255)      DEFAULT NULL COMMENT 'ID único de la transacción',
        amount          DECIMAL(15,2)     DEFAULT NULL,
        currency        VARCHAR(10)       DEFAULT NULL,
        description     VARCHAR(255)      DEFAULT NULL,
        bancard_process_id VARCHAR(255)   DEFAULT NULL COMMENT 'processId retornado por Bancard tras single-buy',
        status_result   VARCHAR(50)       DEFAULT NULL COMMENT 'success | error devuelto por Bancard',
        invoice_number  VARCHAR(255)      DEFAULT NULL COMMENT 'Número de factura electrónica',
        request_payload JSON              DEFAULT NULL COMMENT 'Body completo del request entrante',
        bancard_response JSON             DEFAULT NULL COMMENT 'Respuesta completa de Bancard',
        error_code      VARCHAR(50)       DEFAULT NULL COMMENT 'Código HTTP del error (400, 422, 500)',
        error_message   TEXT              DEFAULT NULL COMMENT 'Mensaje de error legible',
        error_detail    TEXT              DEFAULT NULL COMMENT 'Stack trace o detalle técnico (solo en dev)',
        bancard_messages JSON             DEFAULT NULL COMMENT 'Mensajes de error propios de Bancard',
        ip_address      VARCHAR(64)       DEFAULT NULL,
        created_at      TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shop_process_id (shop_process_id),
        INDEX idx_action (action),
        INDEX idx_servicio (servicio),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Registro completo unificado de todas las operaciones y errores'
    `;

    try {
      await dbPool.query(auditTable);
      
      // Intentar agregar la columna por si la tabla ya existía de versiones anteriores
      try {
        await dbPool.query(`
          ALTER TABLE pago_simple_audits 
          ADD COLUMN invoice_number VARCHAR(255) DEFAULT NULL COMMENT 'Número de factura electrónica' 
          AFTER status_result;
        `);
        console.log('[DB] ➕ Columna invoice_number agregada a la tabla pago_simple_audits.');
      } catch (err: any) {
        // Código 1060 es ER_DUP_FIELDNAME (columna ya existe). Ignoramos el error si ya existe.
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.warn('[DB] ⚠️ No se pudo asegurar la columna invoice_number (puede ignorarse si es error de sintaxis al ya existir):', err.message);
        }
      }
      
      console.log('[DB] ✅ Tabla unificada pago_simple_audits verificada/creada.');
    } catch (error) {
      console.error('[DB] ❌ Error al inicializar tabla pago_simple_audits:', error);
    }
  }

  /**
   * Guarda el registro de auditoría unificado en MySQL.
   * No lanza excepción para no interrumpir el flujo.
   */
  /**
   * Resuelve el shop_process_id interno a partir del process_id de Bancard.
   * Se usa para que el frontend envíe solo el processId (de Bancard) en
   * rollback / confirmation / charge-back, y el backend resuelva el ID interno.
   *
   * @param bancardProcessId - El process_id retornado por Bancard en single-buy.
   * @returns El shop_process_id correspondiente, o null si no se encuentra.
   */
  static async lookupShopProcessId(bancardProcessId: string): Promise<number | null> {
    try {
      const [rows] = await dbPool.query(
        `SELECT shop_process_id
           FROM pago_simple_audits
          WHERE bancard_process_id = ?
            AND action = 'single-buy'
          ORDER BY created_at DESC
          LIMIT 1`,
        [bancardProcessId],
      ) as [Array<{ shop_process_id: string | null }>, unknown];

      const row = rows[0];
      if (!row?.shop_process_id) return null;

      const parsed = parseInt(String(row.shop_process_id), 10);
      return isNaN(parsed) ? null : parsed;
    } catch (error) {
      console.error('[PagoSimpleAudit] ❌ Error al resolver shopProcessId por processId:', error);
      return null;
    }
  }

  /**
   * Recupera el invoice_number guardado asíncronamente por el webhook
   */
  static async getInvoiceNumber(shopProcessId: number | string): Promise<string | null> {
    try {
      const [rows] = await dbPool.query(
        `SELECT invoice_number
           FROM pago_simple_audits
          WHERE shop_process_id = ? AND invoice_number IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [String(shopProcessId)]
      ) as [Array<{ invoice_number: string | null }>, unknown];

      return rows[0]?.invoice_number ?? null;
    } catch (error) {
      console.error('[PagoSimpleAudit] ❌ Error al buscar invoice_number:', error);
      return null;
    }
  }

  /**
   * Recupera el bancard_process_id asociado a un shop_process_id desde el registro 'single-buy'
   */
  static async lookupBancardProcessId(shopProcessId: number | string): Promise<string | null> {
    try {
      const [rows] = await dbPool.query(
        `SELECT bancard_process_id
           FROM pago_simple_audits
          WHERE shop_process_id = ?
            AND bancard_process_id IS NOT NULL
            AND action = 'single-buy'
          ORDER BY created_at DESC
          LIMIT 1`,
        [String(shopProcessId)]
      ) as [Array<{ bancard_process_id: string | null }>, unknown];

      return rows[0]?.bancard_process_id ?? null;
    } catch (error) {
      console.error('[PagoSimpleAudit] ❌ Error al buscar bancard_process_id:', error);
      return null;
    }
  }

  static async saveAuditLog(data: {
    action?: string;
    externalId?: string;
    servicio?: string;
    canal?: string;
    shopProcessId?: number | string;
    amount?: number | string;
    currency?: string;
    description?: string;
    bancardProcessId?: string;
    statusResult?: string;
    invoiceNumber?: string;
    requestPayload?: unknown;
    bancardResponse?: unknown;
    errorCode?: number | string;
    errorMessage?: string;
    errorDetail?: string;
    bancardMessages?: unknown;
    ipAddress?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO pago_simple_audits
        (action, external_id, servicio, canal, shop_process_id, amount, currency,
         description, bancard_process_id, status_result, invoice_number, request_payload, bancard_response,
         error_code, error_message, error_detail, bancard_messages, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await dbPool.query(query, [
        data.action ?? null,
        data.externalId ?? null,
        data.servicio ?? null,
        data.canal ?? null,
        data.shopProcessId ? String(data.shopProcessId) : null,
        data.amount ?? null,
        data.currency ?? null,
        data.description ?? null,
        data.bancardProcessId ?? null,
        data.statusResult ?? null,
        data.invoiceNumber ?? null,
        data.requestPayload ? JSON.stringify(data.requestPayload) : null,
        data.bancardResponse ? JSON.stringify(data.bancardResponse) : null,
        data.errorCode ? String(data.errorCode) : null,
        data.errorMessage ?? null,
        data.errorDetail ?? null,
        data.bancardMessages ? JSON.stringify(data.bancardMessages) : null,
        data.ipAddress ?? null,
      ]);
      console.log(`[PagoSimpleAudit] ✅ Auditoría guardada — action: ${data.action}, status: ${data.statusResult || 'success'}`);
    } catch (error) {
      console.error('[PagoSimpleAudit] ❌ Error al guardar auditoría en BD:', error);
    }
  }
}
