import type { Request, Response } from 'express';
import { PosAudit } from '../models/PosAudit.js';
import { generateShopProcessId } from '../utils/shopProcessIdGenerator.js';
import type { PosFisicoInitRequest, PosFisicoConfirmRequest } from '../types/pos.types.js';

export const initPosFisico = async (req: Request<{}, {}, PosFisicoInitRequest>, res: Response) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Monto inválido.' });
    }

    // Generar un facturaNro único que cumpla con int(15)
    // generateShopProcessId genera un número seguro
    const facturaNroStr = String(generateShopProcessId());
    // Limitar a 15 caracteres numéricos por si acaso
    const facturaNro = facturaNroStr.substring(0, 15);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const insertId = await PosAudit.createRecord({
      factura_nro: facturaNro,
      action: 'pos-fisico-cobro',
      amount: amount,
      status_result: 'pending',
      ip_address: ipAddress
    });

    if (!insertId) {
      return res.status(500).json({ status: 'error', message: 'Error interno guardando auditoría.' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Transacción POS físico iniciada.',
      data: {
        facturaNro: facturaNro
      }
    });

  } catch (error) {
    console.error('Error en initPosFisico:', error);
    return res.status(500).json({ status: 'error', message: 'Error interno del servidor.' });
  }
};

export const confirmPosFisico = async (req: Request<{}, {}, PosFisicoConfirmRequest>, res: Response) => {
  try {
    const { facturaNro, status_result, pos_response, error_message } = req.body;

    if (!facturaNro || !status_result) {
      return res.status(400).json({ status: 'error', message: 'Faltan parámetros requeridos (facturaNro, status_result).' });
    }

    const updated = await PosAudit.updateRecord(facturaNro, {
      status_result,
      pos_response,
      error_message
    });

    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Transacción no encontrada o no se pudo actualizar.' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Auditoría de POS físico actualizada correctamente.'
    });

  } catch (error) {
    console.error('Error en confirmPosFisico:', error);
    return res.status(500).json({ status: 'error', message: 'Error interno del servidor.' });
  }
};
