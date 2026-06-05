import { dbPool } from '../config/db.config.js';

export class PagoSimpleAudit {

  /**
   * Crea las tablas automáticamente si no existen.
   * Debe llamarse en el arranque del servidor (server.ts).
   */
  static async initTable(): Promise<void> {
    const auditTable = `
      CREATE TABLE IF NOT EXISTS pago_simple_audits (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        action          VARCHAR(50)       NOT NULL COMMENT 'single-buy | rollback | confirmation | charge-back',
        external_id     VARCHAR(255)      DEFAULT NULL COMMENT 'ID externo del frontend (campo id)',
        servicio        VARCHAR(255)      DEFAULT NULL COMMENT 'Nombre del servicio/app origen',
        canal           VARCHAR(255)      DEFAULT NULL COMMENT 'Canal / dispositivo (totem, web, etc.)',
        shop_process_id VARCHAR(255)      NOT NULL    COMMENT 'ID único de la transacción',
        amount          DECIMAL(15,2)     DEFAULT NULL,
        currency        VARCHAR(10)       DEFAULT NULL,
        description     VARCHAR(255)      DEFAULT NULL,
        bancard_process_id VARCHAR(255)   DEFAULT NULL COMMENT 'processId retornado por Bancard tras single-buy',
        status_result   VARCHAR(50)       DEFAULT NULL COMMENT 'success | error devuelto por Bancard',
        request_payload JSON              NOT NULL    COMMENT 'Body completo del request entrante',
        bancard_response JSON             DEFAULT NULL COMMENT 'Respuesta completa de Bancard',
        ip_address      VARCHAR(64)       DEFAULT NULL,
        created_at      TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shop_process_id (shop_process_id),
        INDEX idx_action (action),
        INDEX idx_servicio (servicio),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Registro completo de todas las operaciones del Gateway pagosimple'
    `;

    const errorTable = `
      CREATE TABLE IF NOT EXISTS pago_simple_error_logs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        action          VARCHAR(50)       DEFAULT NULL,
        shop_process_id VARCHAR(255)      DEFAULT NULL,
        servicio        VARCHAR(255)      DEFAULT NULL,
        canal           VARCHAR(255)      DEFAULT NULL,
        error_code      VARCHAR(50)       DEFAULT NULL COMMENT 'Código HTTP del error (400, 422, 500)',
        error_message   TEXT              DEFAULT NULL COMMENT 'Mensaje de error legible',
        error_detail    TEXT              DEFAULT NULL COMMENT 'Stack trace o detalle técnico (solo en dev)',
        bancard_messages JSON             DEFAULT NULL COMMENT 'Mensajes de error propios de Bancard',
        request_payload JSON              DEFAULT NULL COMMENT 'Payload que causó el error',
        ip_address      VARCHAR(64)       DEFAULT NULL,
        created_at      TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_action (action),
        INDEX idx_shop_process_id (shop_process_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Log persistente de errores del Gateway pagosimple'
    `;

    try {
      await dbPool.query(auditTable);
      console.log('[DB] ✅ Tabla pago_simple_audits verificada/creada.');
    } catch (error) {
      console.error('[DB] ❌ Error al inicializar tabla pago_simple_audits:', error);
    }

    try {
      await dbPool.query(errorTable);
      console.log('[DB] ✅ Tabla pago_simple_error_logs verificada/creada.');
    } catch (error) {
      console.error('[DB] ❌ Error al inicializar tabla pago_simple_error_logs:', error);
    }
  }

  /**
   * Guarda el registro de auditoría exitoso en MySQL.
   * No lanza excepción para no interrumpir el flujo de pago.
   */
  static async saveAuditLog(data: {
    action: string;
    externalId?: string;
    servicio?: string;
    canal?: string;
    shopProcessId: number | string;
    amount?: number | string;
    currency?: string;
    description?: string;
    bancardProcessId?: string;
    statusResult?: string;
    requestPayload: unknown;
    bancardResponse: unknown;
    ipAddress?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO pago_simple_audits
        (action, external_id, servicio, canal, shop_process_id, amount, currency,
         description, bancard_process_id, status_result, request_payload, bancard_response, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await dbPool.query(query, [
        data.action,
        data.externalId ?? null,
        data.servicio ?? null,
        data.canal ?? null,
        String(data.shopProcessId),
        data.amount ?? null,
        data.currency ?? null,
        data.description ?? null,
        data.bancardProcessId ?? null,
        data.statusResult ?? null,
        JSON.stringify(data.requestPayload),
        JSON.stringify(data.bancardResponse),
        data.ipAddress ?? null,
      ]);
      console.log(`[PagoSimpleAudit] ✅ Auditoría guardada — action: ${data.action}, shopProcessId: ${data.shopProcessId}`);
    } catch (error) {
      // No relanzamos para que el pago no se interrumpa por un error de BD aislado.
      console.error('[PagoSimpleAudit] ❌ Error al guardar auditoría en BD:', error);
    }
  }

  /**
   * Guarda un log de error persistente en MySQL.
   * No lanza excepción.
   */
  static async saveErrorLog(data: {
    action?: string;
    shopProcessId?: number | string;
    servicio?: string;
    canal?: string;
    errorCode?: number | string;
    errorMessage?: string;
    errorDetail?: string;
    bancardMessages?: unknown;
    requestPayload?: unknown;
    ipAddress?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO pago_simple_error_logs
        (action, shop_process_id, servicio, canal, error_code, error_message,
         error_detail, bancard_messages, request_payload, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await dbPool.query(query, [
        data.action ?? null,
        data.shopProcessId ? String(data.shopProcessId) : null,
        data.servicio ?? null,
        data.canal ?? null,
        data.errorCode ? String(data.errorCode) : null,
        data.errorMessage ?? null,
        data.errorDetail ?? null,
        data.bancardMessages ? JSON.stringify(data.bancardMessages) : null,
        data.requestPayload ? JSON.stringify(data.requestPayload) : null,
        data.ipAddress ?? null,
      ]);
      console.log(`[PagoSimpleAudit] ⚠️  Error log guardado — action: ${data.action}, shopProcessId: ${data.shopProcessId}`);
    } catch (error) {
      console.error('[PagoSimpleAudit] ❌ Error al guardar error log en BD:', error);
    }
  }
}
