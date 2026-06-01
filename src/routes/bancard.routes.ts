/**
 * bancard.routes.ts
 * Definición de rutas Express tipadas para la integración con Bancard vPOS.
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  initiateSingleBuy,
  initiatePagoSimple,
  rollback,
  getConfirmation,
  chargeBack,
  confirmWebhook,
  healthCheck,
} from '../controllers/bancardController.js';

const router = Router();
export const pagoSimpleRouter = Router();

// ─── Validaciones reutilizables ──────────────────────────────────────────────

const shopProcessIdBodyValidation = () =>
  body('shopProcessId')
    .notEmpty().withMessage('shopProcessId es requerido.')
    .isInt({ min: 1 }).withMessage('shopProcessId debe ser un entero positivo.');

const shopProcessIdParamValidation = () =>
  param('shopProcessId')
    .notEmpty().withMessage('shopProcessId es requerido.')
    .isInt({ min: 1 }).withMessage('shopProcessId debe ser un entero positivo.');

const amountValidation = () =>
  body('amount')
    .notEmpty().withMessage('amount es requerido.')
    .isFloat({ min: 0.01 }).withMessage('amount debe ser un número positivo mayor a 0.');

const currencyValidation = () =>
  body('currency')
    .optional()
    .isIn(['PYG', 'USD']).withMessage('currency debe ser PYG o USD.');

const servicioValidation = () =>
  body('servicio')
    .optional()
    .isString().withMessage('servicio debe ser un texto.');

const canalValidation = () =>
  body('canal')
    .optional()
    .isString().withMessage('canal debe ser un texto.');

const idValidation = () =>
  body('id')
    .optional()
    .isString().withMessage('id debe ser un texto.');

// ─── Rutas ───────────────────────────────────────────────────────────────────

/** GET /api/bancard/health — Health check */
router.get('/health', healthCheck);

/**
 * POST /api/bancard/single-buy
 * Inicia una compra simple — retorna process_id + iframeUrl
 */
router.post(
  '/single-buy',
  [
    shopProcessIdBodyValidation(),
    amountValidation(),
    currencyValidation(),
    body('description')
      .notEmpty().withMessage('description es requerida.')
      .isLength({ max: 50 }).withMessage('description no puede superar 50 caracteres.'),
    body('additionalData').optional().isString(),
    body('returnUrl').optional().isURL().withMessage('returnUrl debe ser una URL válida.'),
    body('cancelUrl').optional().isURL().withMessage('cancelUrl debe ser una URL válida.'),
  ],
  initiateSingleBuy,
);

/**
 * POST /api/pagosimple
 * Iniciar compra simple a través de nuestra interfaz
 */
pagoSimpleRouter.post(
  '/pagosimple',
  [
    shopProcessIdBodyValidation(),
    amountValidation(),
    currencyValidation(),
    servicioValidation(),
    canalValidation(),
    idValidation(),
    body('description')
      .notEmpty().withMessage('description es requerida.')
      .isLength({ max: 50 }).withMessage('description no puede superar 50 caracteres.'),
    body('additionalData').optional().isString(),
    body('returnUrl').optional().isURL().withMessage('returnUrl debe ser una URL válida.'),
    body('cancelUrl').optional().isURL().withMessage('cancelUrl debe ser una URL válida.'),
  ],
  initiatePagoSimple,
);
/**
 * POST /api/bancard/rollback
 * Revierte una transacción no confirmada
 */
router.post('/rollback', [shopProcessIdBodyValidation()], rollback);

/**
 * GET /api/bancard/confirmation/:shopProcessId
 * Consulta el estado de una transacción
 */
router.get('/confirmation/:shopProcessId', [shopProcessIdParamValidation()], getConfirmation);

/**
 * POST /api/bancard/charge-back
 * Contracargo / devolución
 */
router.post(
  '/charge-back',
  [shopProcessIdBodyValidation(), amountValidation(), currencyValidation()],
  chargeBack,
);

/**
 * POST /api/bancard/confirm  ← Webhook de Bancard
 * ⚠️  Registrar esta URL en el Portal de Comercios de Bancard.
 */
router.post('/confirm', confirmWebhook);

export default router;
