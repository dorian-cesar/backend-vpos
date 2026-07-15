import { Router } from 'express';
import { initPosFisico, confirmPosFisico } from '../controllers/posController.js';

export const posFisicoRouter = Router();

// Endpoint para inicializar la venta en el POS físico (generar facturaNro y auditar)
posFisicoRouter.post('/pos-fisico/init', initPosFisico);

// Endpoint para confirmar el resultado del POS físico
posFisicoRouter.post('/pos-fisico/confirm', confirmPosFisico);
