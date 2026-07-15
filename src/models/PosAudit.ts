import { dbPool } from '../config/db.config.js';

export interface PosAuditRecord {
  factura_nro: string;
  action: string;
  amount: number;
  status_result: string;
  pos_response?: any;
  error_message?: string;
  ip_address?: string;
}

export class PosAudit {
  /**
   * Crea la tabla audit_pos automáticamente si no existe.
   */
  static async initTable(): Promise<void> {
    const auditTable = `
      CREATE TABLE IF NOT EXISTS audit_pos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        action          VARCHAR(50)       DEFAULT 'pos-fisico-cobro',
        factura_nro     VARCHAR(255)      NOT NULL,
        amount          DECIMAL(15,2)     DEFAULT NULL,
        status_result   VARCHAR(50)       DEFAULT 'pending',
        pos_response    JSON              DEFAULT NULL,
        error_message   TEXT              DEFAULT NULL,
        ip_address      VARCHAR(64)       DEFAULT NULL,
        created_at      TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP         DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_factura_nro (factura_nro),
        INDEX idx_status_result (status_result),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Auditoría de operaciones del POS físico';
    `;

    try {
      await dbPool.query(auditTable);
      console.log('✅ Tabla `audit_pos` verificada/creada correctamente.');
    } catch (error) {
      console.error('❌ Error creando la tabla `audit_pos`:', error);
    }
  }

  /**
   * Registra el inicio de una transacción POS.
   */
  static async createRecord(data: PosAuditRecord): Promise<number | null> {
    const query = `
      INSERT INTO audit_pos 
      (factura_nro, action, amount, status_result, ip_address) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
      data.factura_nro,
      data.action || 'pos-fisico-cobro',
      data.amount,
      data.status_result || 'pending',
      data.ip_address || null
    ];

    try {
      const [result] = await dbPool.query(query, params) as any;
      return result.insertId;
    } catch (error) {
      console.error('❌ Error en PosAudit.createRecord:', error);
      return null;
    }
  }

  /**
   * Actualiza el registro con el resultado final del POS físico.
   */
  static async updateRecord(factura_nro: string, data: Partial<PosAuditRecord>): Promise<boolean> {
    const fields: string[] = [];
    const params: any[] = [];

    if (data.status_result !== undefined) {
      fields.push('status_result = ?');
      params.push(data.status_result);
    }
    if (data.pos_response !== undefined) {
      fields.push('pos_response = ?');
      params.push(JSON.stringify(data.pos_response));
    }
    if (data.error_message !== undefined) {
      fields.push('error_message = ?');
      params.push(data.error_message);
    }

    if (fields.length === 0) return false;

    const query = `UPDATE audit_pos SET ${fields.join(', ')} WHERE factura_nro = ?`;
    params.push(factura_nro);

    try {
      const [result] = await dbPool.query(query, params) as any;
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error en PosAudit.updateRecord:', error);
      return false;
    }
  }
}
