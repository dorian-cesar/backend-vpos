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

/**
 * @swagger
 * components:
 *   schemas:
 *     BancardMessage:
 *       type: object
 *       properties:
 *         level:
 *           type: string
 *           example: "info"
 *         key:
 *           type: string
 *           example: "info_key"
 *         dsc:
 *           type: string
 *           example: "Operación realizada con éxito"
 *     BancardConfirmation:
 *       type: object
 *       properties:
 *         shop_process_id:
 *           type: integer
 *           example: 101
 *         ticket_number:
 *           type: string
 *           example: "123456"
 *         authorization_number:
 *           type: string
 *           example: "654321"
 *         amount:
 *           type: string
 *           example: "15000.00"
 *         currency:
 *           type: string
 *           example: "PYG"
 *         card_brand:
 *           type: string
 *           example: "VISA"
 *         card_masked_number:
 *           type: string
 *           example: "411111XXXXXX1111"
 *         response_code:
 *           type: string
 *           example: "00"
 *         response_description:
 *           type: string
 *           example: "Approved"
 *         extended_response_description:
 *           type: string
 *           example: "Transaction completed successfully"
 *     ApiSuccessResponseSingleBuy:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: "success"
 *         message:
 *           type: string
 *           example: "Compra iniciada exitosamente."
 *         data:
 *           type: object
 *           properties:
 *             processId:
 *               type: string
 *               example: "abc123xyz"
 *             iframeUrl:
 *               type: string
 *               example: "https://vpos.bancard.com.py/checkout/abc123xyz"
 *             sdkUrl:
 *               type: string
 *               example: "https://vpos.bancard.com.py/checkout/xml.js"
 *             status:
 *               type: string
 *               example: "success"
 *             environment:
 *               type: string
 *               example: "staging"
 *     ApiErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: "error"
 *         message:
 *           type: string
 *           example: "Datos de entrada inválidos o error en proceso."
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 example: "shopProcessId"
 *               message:
 *                 type: string
 *                 example: "shopProcessId es requerido."
 *         bancardMessages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BancardMessage'
 *         detail:
 *           type: string
 *           example: "Internal error stack details (only visible in dev)"
 */

/**
 * @swagger
 * /api/bancard/health:
 *   get:
 *     summary: Verifica el estado del servidor
 *     tags: [Health Check]
 *     responses:
 *       200:
 *         description: El backend está activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 service:
 *                   type: string
 *                   example: "Bancard vPOS"
 *                 environment:
 *                   type: string
 *                   example: "staging"
 *                 timestamp:
 *                   type: string
 *                   example: "2026-06-03T14:08:43.000Z"
 */
router.get('/health', healthCheck);

/**
 * @swagger
 * /api/bancard/single-buy:
 *   post:
 *     summary: Iniciar una compra simple en Bancard
 *     tags: [Bancard Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shopProcessId
 *               - amount
 *               - description
 *             properties:
 *               shopProcessId:
 *                 type: integer
 *                 example: 102
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *               currency:
 *                 type: string
 *                 enum: [PYG, USD]
 *                 example: "PYG"
 *               description:
 *                 type: string
 *                 maxLength: 50
 *                 example: "Compra de Boleto de Custodia"
 *               additionalData:
 *                 type: string
 *                 example: "Información adicional"
 *               returnUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://midominio.com/pago/exitoso"
 *               cancelUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://midominio.com/pago/cancelado"
 *     responses:
 *       200:
 *         description: Compra iniciada exitosamente, retorna el identificador del proceso y las URLs para el frontend.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponseSingleBuy'
 *       400:
 *         description: Error en la comunicación con Bancard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Parámetros de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
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
 * @swagger
 * /api/pagosimple:
 *   post:
 *     summary: Iniciar una compra simple y registrar auditoría (Pago Simple)
 *     tags: [Pago Simple]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shopProcessId
 *               - amount
 *               - description
 *             properties:
 *               shopProcessId:
 *                 type: integer
 *                 example: 103
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *               currency:
 *                 type: string
 *                 enum: [PYG, USD]
 *                 example: "PYG"
 *               description:
 *                 type: string
 *                 maxLength: 50
 *                 example: "Compra de Boleto"
 *               servicio:
 *                 type: string
 *                 example: "boletos/custodia"
 *               canal:
 *                 type: string
 *                 example: "totem/web/puntodeventa"
 *               id:
 *                 type: string
 *                 example: "ext-12345"
 *               additionalData:
 *                 type: string
 *                 example: "Detalles extra"
 *               returnUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://midominio.com/pago/exitoso"
 *               cancelUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://midominio.com/pago/cancelado"
 *     responses:
 *       200:
 *         description: Pago iniciado correctamente y auditoría guardada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponseSingleBuy'
 *       400:
 *         description: Error en la comunicación con Bancard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Parámetros de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
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
 * @swagger
 * /api/bancard/rollback:
 *   post:
 *     summary: Revierte una transacción no confirmada
 *     tags: [Bancard Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shopProcessId
 *             properties:
 *               shopProcessId:
 *                 type: integer
 *                 example: 102
 *     responses:
 *       200:
 *         description: Rollback ejecutado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Rollback ejecutado."
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BancardMessage'
 *       422:
 *         description: Parámetros de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Error al ejecutar el rollback
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/rollback', [shopProcessIdBodyValidation()], rollback);

/**
 * @swagger
 * /api/bancard/confirmation/{shopProcessId}:
 *   get:
 *     summary: Consulta el estado y confirmación de una transacción
 *     tags: [Bancard Operations]
 *     parameters:
 *       - in: path
 *         name: shopProcessId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la transacción en la tienda
 *         example: 102
 *     responses:
 *       200:
 *         description: Confirmación obtenida del estado de la transacción.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     confirmation:
 *                       $ref: '#/components/schemas/BancardConfirmation'
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BancardMessage'
 *       422:
 *         description: Parámetros de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Error al consultar la confirmación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/confirmation/:shopProcessId', [shopProcessIdParamValidation()], getConfirmation);

/**
 * @swagger
 * /api/bancard/charge-back:
 *   post:
 *     summary: Procesa un contracargo o devolución de un pago aprobado
 *     tags: [Bancard Operations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shopProcessId
 *               - amount
 *             properties:
 *               shopProcessId:
 *                 type: integer
 *                 example: 102
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *               currency:
 *                 type: string
 *                 enum: [PYG, USD]
 *                 example: "PYG"
 *     responses:
 *       200:
 *         description: Contracargo procesado correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Contracargo procesado."
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BancardMessage'
 *       422:
 *         description: Parámetros de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Error al procesar el contracargo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/charge-back',
  [shopProcessIdBodyValidation(), amountValidation(), currencyValidation()],
  chargeBack,
);

/**
 * @swagger
 * /api/bancard/confirm:
 *   post:
 *     summary: Webhook de confirmación de pago enviado por Bancard
 *     description: Endpoint que Bancard invoca de manera asíncrona para notificar el resultado del pago. Debe estar registrado en el Portal de Comercios de Bancard.
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               operation:
 *                 $ref: '#/components/schemas/BancardConfirmation'
 *     responses:
 *       200:
 *         description: Webhook recibido y procesado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     shopProcessId:
 *                       type: integer
 *                       example: 102
 *                     processed:
 *                       type: boolean
 *                       example: true
 *       500:
 *         description: Error al procesar el webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Error procesando confirmación."
 */
router.post('/confirm', confirmWebhook);

export default router;
