/**
 * bancard.routes.ts
 * Definición de rutas Express tipadas para la integración con Bancard vPOS.
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  initiateSingleBuy,
  pagoSimpleGateway,
  rollback,
  getConfirmation,
  chargeBack,
  confirmWebhook,
  healthCheck,
  paymentSuccessHandler,
  paymentCancelHandler,
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
 *     PaymentConfirmationSummary:
 *       type: object
 *       properties:
 *         responseCode:
 *           type: string
 *           example: "00"
 *         responseDescription:
 *           type: string
 *           example: "Approved"
 *         ticketNumber:
 *           type: string
 *           example: "123456"
 *         authorizationNumber:
 *           type: string
 *           example: "654321"
 *         amount:
 *           type: string
 *           example: "15000.00"
 *         currency:
 *           type: string
 *           example: "PYG"
 *         cardBrand:
 *           type: string
 *           example: "VISA"
 *         cardMaskedNumber:
 *           type: string
 *           example: "411111XXXXXX1111"
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
 *               - amount
 *               - description
 *             properties:
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
    // shopProcessId se genera en el backend — no se valida del request
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
 *     summary: Gateway Unificado — Punto de entrada único para frontends externos
 *     description: |
 *       Un único endpoint que despacha hacia la operación de Bancard correcta según el campo `action`.
 *       Todos los requests quedan registrados en la auditoría de MySQL.
 *
 *       **Acciones disponibles:**
 *       - `single-buy`: Iniciar un nuevo pago (requiere `amount`, `description`).
 *       - `rollback`: Revertir una transacción pendiente (requiere `processId`).
 *       - `confirmation`: Consultar el estado de una transacción (requiere `processId`).
 *       - `charge-back`: Devolver un pago aprobado (requiere `processId`, `amount`).
 *       - `cards-new`: Iniciar catastro de tarjeta (requiere `cardId`, `userId`, `userCellPhone`, `userMail`).
 *       - `list-cards`: Listar tarjetas de un usuario (requiere `userId`).
 *       - `charge`: Pago directo con tarjeta catastrada (requiere `amount`, `description`, `aliasToken`).
 *       - `delete-card`: Eliminar una tarjeta catastrada (requiere `userId`, `aliasToken`).
 *       - `cancel-billing`: Cancelar factura electrónica (requiere `processId`, `clientRuc`).
 *       - `preauth-confirm`: Confirmar preautorización (requiere `processId`).
 *       - `client-info`: Consultar datos de cliente por RUC (requiere `clientRuc`).
 *     tags: [Pago Simple — Gateway]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [single-buy, rollback, confirmation, charge-back, cards-new, list-cards, charge, delete-card, cancel-billing, preauth-confirm, client-info]
 *                 example: "single-buy"
 *                 description: Operación a ejecutar. Determina qué campos adicionales son necesarios.
 *               servicio:
 *                 type: string
 *                 example: "boletos/custodia"
 *                 description: Identificador del servicio para auditoría (opcional).
 *               canal:
 *                 type: string
 *                 example: "totem/web/puntodeventa"
 *                 description: Canal de venta para auditoría (opcional).
 *               id:
 *                 type: string
 *                 example: "ref-externo-123"
 *                 description: ID externo de referencia para auditoría (opcional).
 *               processId:
 *                 type: string
 *                 example: "aBcD1234"
 *                 description: ID de proceso de Bancard. Requerido para rollback, confirmation, charge-back, cancel-billing y preauth-confirm.
 *               amount:
 *                 type: number
 *                 example: 25000.00
 *                 description: Requerido para single-buy y charge-back.
 *               currency:
 *                 type: string
 *                 enum: [PYG, USD]
 *                 example: "PYG"
 *               description:
 *                 type: string
 *                 maxLength: 50
 *                 example: "Compra de Boleto"
 *                 description: Requerido solo para single-buy.
 *               ivaAmount:
 *                 type: number
 *                 example: 1033.00
 *                 description: Opcional. Monto del IVA de la factura.
 *               billing:
 *                 type: object
 *                 description: Opcional. Información para Factura Electrónica.
 *               clientRuc:
 *                 type: string
 *                 example: "123456-1"
 *                 description: Requerido para cancel-billing y client-info.
 *               additionalData:
 *                 type: string
 *                 example: "Datos adicionales"
 *               returnUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://mi-front.com/pago/exitoso"
 *                 description: |
 *                   URL a donde Bancard redirige al usuario tras completar el pago.
 *                   **Debe ser la URL propia del front que consume este backend.**
 *                   Si no se envía, el backend usa el default del `.env` (`APP_BASE_URL + RETURN_URL`).
 *                   Aplica a `single-buy` y `cards-new`.
 *               cancelUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://mi-front.com/pago/cancelado"
 *                 description: |
 *                   URL a donde Bancard redirige al usuario si cancela o hay error.
 *                   **Debe ser la URL propia del front que consume este backend.**
 *                   Si no se envía, el backend usa el default del `.env` (`APP_BASE_URL + CANCEL_URL`).
 *                   Aplica a `single-buy` y `cards-new`.
 *           examples:
 *             single-buy:
 *               summary: Iniciar un pago
 *               value:
 *                 action: "single-buy"
 *                 amount: 25000.00
 *                 currency: "PYG"
 *                 description: "Compra de Boleto"
 *                 ivaAmount: 2500.00
 *                 billing:
 *                   client_ruc: "123456-1"
 *                   client_name: "JUAN GONZALEZ"
 *                   client_email: "juan@mail.com"
 *                   details:
 *                     - description: "Boleto 1"
 *                       amount: 25000.00
 *                       iva_rate: 10
 *                       total_items: 1
 *                 returnUrl: "https://mi-front.com/pago/exitoso"
 *                 cancelUrl: "https://mi-front.com/pago/cancelado"
 *                 servicio: "boletos/custodia"
 *                 canal: "totem/web/puntodeventa"
 *             rollback:
 *               summary: Revertir una transacción
 *               value:
 *                 action: "rollback"
 *                 processId: "aBcD1234"
 *                 servicio: "boletos/custodia"
 *                 canal: "totem"
 *             confirmation:
 *               summary: Consultar estado de una transacción
 *               value:
 *                 action: "confirmation"
 *                 processId: "aBcD1234"
 *             charge-back:
 *               summary: Devolución de pago aprobado
 *               value:
 *                 action: "charge-back"
 *                 processId: "aBcD1234"
 *                 amount: 25000.00
 *                 currency: "PYG"
 *             cards-new:
 *               summary: Iniciar catastro de nueva tarjeta
 *               value:
 *                 action: "cards-new"
 *                 cardId: 999123
 *                 userId: 1
 *                 userCellPhone: "0981123456"
 *                 userMail: "test@mail.com"
 *                 returnUrl: "https://mi-front.com/catastro/exitoso"
 *                 cancelUrl: "https://mi-front.com/catastro/cancelado"
 *             list-cards:
 *               summary: Listar tarjetas de usuario
 *               value:
 *                 action: "list-cards"
 *                 userId: 1
 *             charge:
 *               summary: Cobro con tarjeta guardada (alias)
 *               value:
 *                 action: "charge"
 *                 amount: 15000.00
 *                 description: "Pago recurrente"
 *                 aliasToken: "alias-token-valido-123"
 *             delete-card:
 *               summary: Eliminar tarjeta catastrada
 *               value:
 *                 action: "delete-card"
 *                 userId: 1
 *                 aliasToken: "alias-token-valido-123"
 *             cancel-billing:
 *               summary: Cancelar factura electrónica
 *               value:
 *                 action: "cancel-billing"
 *                 processId: "aBcD1234"
 *                 clientRuc: "123456-1"
 *             preauth-confirm:
 *               summary: Confirmar preautorización
 *               value:
 *                 action: "preauth-confirm"
 *                 processId: "aBcD1234"
 *             client-info:
 *               summary: Consultar cliente por RUC
 *               value:
 *                 action: "client-info"
 *                 clientRuc: "123456-1"
 *     responses:
 *       200:
 *         description: Operación ejecutada correctamente. La estructura de `data` varía según el `action`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 action:
 *                   type: string
 *                   example: "single-buy"
 *                 message:
 *                   type: string
 *                   example: "Compra iniciada exitosamente."
 *                 data:
 *                   type: object
 *                   description: Resultado de la operación. Ver esquemas específicos por acción.
 *       400:
 *         description: Error en la comunicación con Bancard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Parámetros de entrada inválidos o acción no reconocida
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
    body('action')
      .notEmpty().withMessage('El campo action es requerido.')
      .isIn(['single-buy', 'rollback', 'confirmation', 'charge-back', 'cards-new', 'list-cards', 'charge', 'delete-card', 'cancel-billing', 'preauth-confirm', 'client-info'])
      .withMessage('action debe ser: single-buy, rollback, confirmation, charge-back, cards-new, list-cards, charge, delete-card, cancel-billing, preauth-confirm o client-info.'),
    servicioValidation(),
    canalValidation(),
    idValidation(),
    // processId: el process_id de Bancard, usado como referencia en rollback/confirmation/charge-back
    body('processId').optional().isString().withMessage('processId debe ser un texto.'),
    body('currency').optional().isIn(['PYG', 'USD']).withMessage('currency debe ser PYG o USD.'),
    body('additionalData').optional().isString(),
    body('returnUrl').optional().isURL({ require_tld: false }).withMessage('returnUrl debe ser una URL válida.'),
    body('cancelUrl').optional().isURL({ require_tld: false }).withMessage('cancelUrl debe ser una URL válida.'),
    body('description').optional().isString().isLength({ max: 50 }).withMessage('description no puede superar 50 caracteres.'),
  ],
  pagoSimpleGateway,
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
 *                       $ref: '#/components/schemas/PaymentConfirmationSummary'
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
 *                 $ref: '#/components/schemas/PaymentConfirmationSummary'
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

/**
 * @swagger
 * /api/bancard/success:
 *   get:
 *     summary: URL de retorno para pago exitoso (uso en testing)
 *     tags: [Visualización]
 */
router.get('/success', paymentSuccessHandler);

/**
 * @swagger
 * /api/bancard/cancel:
 *   get:
 *     summary: URL de retorno para pago cancelado o fallido (uso en testing)
 *     tags: [Visualización]
 */
router.get('/cancel', paymentCancelHandler);

export default router;
