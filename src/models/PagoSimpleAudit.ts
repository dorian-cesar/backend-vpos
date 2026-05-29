import { dbPool } from '../config/db.config';

export class PagoSimpleAudit {
  
  /**
   * Crea la tabla automáticamente si no existe. 
   * Útil ya que no se utiliza un ORM complejo con migraciones.
   */
  static async initTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS pago_simple_audits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        external_id VARCHAR(255),
        servicio VARCHAR(255),
        canal VARCHAR(255),
        shop_process_id VARCHAR(255),
        amount DECIMAL(15,2),
        request_payload JSON,
        bancard_response JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    try {
      await dbPool.query(query);
      console.log('[DB] Tabla pago_simple_audits verificada/creada.');
    } catch (error) {
      console.error('[DB] Error al inicializar tabla pago_simple_audits:', error);
    }
  }

  /**
   * Guarda el registro de auditoría en MySQL.
   */
  static async saveAuditLog(data: {
    externalId?: string;
    servicio?: string;
    canal?: string;
    shopProcessId: number | string;
    amount: number | string;
    requestPayload: any;
    bancardResponse: any;
  }): Promise<void> {
    const query = `
      INSERT INTO pago_simple_audits 
      (external_id, servicio, canal, shop_process_id, amount, request_payload, bancard_response) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    try {
      await dbPool.query(query, [
        data.externalId || null,
        data.servicio || null,
        data.canal || null,
        String(data.shopProcessId),
        data.amount,
        JSON.stringify(data.requestPayload),
        JSON.stringify(data.bancardResponse)
      ]);
      console.log(`[PagoSimpleAudit] Auditoría guardada en MySQL para shopProcessId: ${data.shopProcessId}`);
    } catch (error) {
      console.error('[PagoSimpleAudit] Error al guardar en base de datos:', error);
      // No relanzamos el error (throw) para que el pago no se interrumpa
      // si ocurre un problema aislado de la base de datos (según requerimiento).
    }
  }
}
