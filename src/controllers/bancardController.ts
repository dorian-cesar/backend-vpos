/**
 * bancardController.ts
 * Controladores Express tipados para los endpoints de Bancard vPOS.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { validationResult } from 'express-validator';
import { BancardService, BancardApiError } from '../services/BancardService.js';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  BancardWebhookPayload,
  ChargeBackRequest,
  RollbackRequest,
  SingleBuyRequest,
  PagoSimpleRequest,
} from '../types/bancard.types.js';
import { PagoSimpleAudit } from '../models/PagoSimpleAudit.js';

// Singleton del servicio
const bancardService = new BancardService();

// ─── Helper: valida el request y retorna false si hay errores ───────────────

const checkValidation = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const body: ApiErrorResponse = {
      status: 'error',
      message: 'Datos de entrada inválidos.',
      errors: errors.array().map((e) => ({
        field: 'path' in e ? String(e.path) : 'unknown',
        message: e.msg as string,
      })),
    };
    res.status(422).json(body);
    return false;
  }
  return true;
};

// ─── 1. POST /api/bancard/single-buy ───────────────────────────────────────

export const initiateSingleBuy = async (
  req: Request<ParamsDictionary, unknown, SingleBuyRequest>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    const { shopProcessId, amount, currency, description, additionalData, returnUrl, cancelUrl } =
      req.body;

    const result = await bancardService.initiateSingleBuy({
      shopProcessId,
      amount,
      currency,
      description,
      additionalData,
      returnUrl,
      cancelUrl,
    });

    const body: ApiSuccessResponse<typeof result> = {
      status: 'success',
      message: 'Compra iniciada exitosamente.',
      data: result,
    };
    res.status(200).json(body);
  } catch (error) {
    if (error instanceof BancardApiError) {
      const body: ApiErrorResponse = {
        status: 'error',
        message: error.message,
        bancardMessages: error.bancardMessages,
      };
      res.status(400).json(body);
      return;
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] initiateSingleBuy:', message);
    const body: ApiErrorResponse = {
      status: 'error',
      message: 'Error interno del servidor al comunicarse con Bancard.',
      ...(process.env.NODE_ENV !== 'production' && { detail: message }),
    };
    res.status(500).json(body);
  }
};

// ─── 1.B POST /api/pagosimple — Gateway Unificado ────────────────────────────
// Único punto de entrada para frontends externos.
// El campo `action` determina qué operación de Bancard se ejecuta.

export const pagoSimpleGateway = async (
  req: Request<Record<string, never>, unknown, PagoSimpleRequest>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  const { action, servicio, canal, id } = req.body;
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined;
  let result: unknown = null;
  let statusCode = 200;
  let responseBody: unknown = null;

  // ─── Auditoría base (campos comunes a todas las acciones) ───────────────
  const auditBase = {
    action,
    externalId: id,
    servicio,
    canal,
    shopProcessId: req.body.shopProcessId ?? 0,
    amount: req.body.amount ?? undefined,
    currency: req.body.currency ?? undefined,
    description: req.body.description ?? undefined,
    requestPayload: req.body,
    ipAddress,
  };

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`[bancardController] ► Petición entrante de frontend (action: ${action})`);
  console.log('[bancardController] Payload:', JSON.stringify(req.body, null, 2));
  console.log('──────────────────────────────────────────────────────────────');

  try {
    switch (action) {

      // ── 1. single-buy: iniciar una nueva compra ───────────────────────────
      case 'single-buy': {
        const { shopProcessId, amount, currency, description, additionalData, returnUrl, cancelUrl } = req.body;

        if (!shopProcessId || !amount || !description) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!shopProcessId ? [{ field: 'shopProcessId', message: 'shopProcessId es requerido para single-buy.' }] : []),
              ...(!amount ? [{ field: 'amount', message: 'amount es requerido para single-buy.' }] : []),
              ...(!description ? [{ field: 'description', message: 'description es requerida para single-buy.' }] : []),
            ],
          });
          return;
        }

        result = await bancardService.initiateSingleBuy({
          shopProcessId,
          amount,
          currency,
          description,
          additionalData,
          returnUrl,
          cancelUrl,
        });

        responseBody = {
          status: 'success',
          action,
          message: 'Compra iniciada exitosamente.',
          data: result,
        };
        break;
      }

      // ── 2. rollback: revertir transacción pendiente ───────────────────────
      case 'rollback': {
        const { shopProcessId } = req.body;

        if (!shopProcessId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'shopProcessId', message: 'shopProcessId es requerido para rollback.' }],
          });
          return;
        }

        const rollbackResult = await bancardService.rollback(shopProcessId);
        result = rollbackResult;

        responseBody = {
          status: rollbackResult.status,
          action,
          message: rollbackResult.status === 'success' ? 'Rollback ejecutado correctamente.' : 'Error al ejecutar rollback.',
          data: {
            shopProcessId,
            processed: rollbackResult.status === 'success',
            messages: rollbackResult.messages,
            rawResponse: rollbackResult.rawResponse
          },
        };
        break;
      }

      // ── 3. confirmation: consultar estado de una transacción ──────────────
      case 'confirmation': {
        const { shopProcessId } = req.body;

        if (!shopProcessId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'shopProcessId', message: 'shopProcessId es requerido para confirmation.' }],
          });
          return;
        }

        result = await bancardService.getConfirmation(shopProcessId);

        responseBody = {
          status: 'success',
          action,
          message: 'Confirmación obtenida correctamente.',
          data: result,
        };
        break;
      }

      // ── 4. charge-back: devolución de un pago aprobado ───────────────────
      case 'charge-back': {
        const { shopProcessId, amount, currency } = req.body;

        if (!shopProcessId || !amount) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!shopProcessId ? [{ field: 'shopProcessId', message: 'shopProcessId es requerido para charge-back.' }] : []),
              ...(!amount ? [{ field: 'amount', message: 'amount es requerido para charge-back.' }] : []),
            ],
          });
          return;
        }

        result = await bancardService.chargeBack({ shopProcessId, amount, currency });

        responseBody = {
          status: 'success',
          action,
          message: 'Contracargo procesado correctamente.',
          data: result,
        };
        break;
      }

      // ── Acción desconocida (no debería llegar aquí por la validación) ─────
      default: {
        res.status(422).json({
          status: 'error',
          message: `Acción no reconocida: "${action}". Valores válidos: single-buy, rollback, confirmation, charge-back.`,
        });
        return;
      }
    }

    // ─── Auditoría exitosa — incluye processId de Bancard si viene en result ─
    const typedResult = result as Record<string, unknown> | null;
    await PagoSimpleAudit.saveAuditLog({
      ...auditBase,
      bancardProcessId: typedResult?.processId as string | undefined,
      statusResult: typedResult?.status as string | undefined ?? 'success',
      bancardResponse: result,
    });

    res.status(statusCode).json(responseBody);

  } catch (error) {
    // ─── Manejo centralizado de errores ──────────────────────────────────
    let errorResponse: unknown;
    let bancardMessages: unknown;

    if (error instanceof BancardApiError) {
      bancardMessages = error.bancardMessages;
      errorResponse = {
        status: 'error',
        action,
        message: error.message,
        bancardMessages,
      };
      statusCode = 400;
    } else {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[pagoSimpleGateway] Error en acción "${action}":`, message);
      errorResponse = {
        status: 'error',
        action,
        message: 'Error interno del servidor al comunicarse con Bancard.',
        ...(process.env.NODE_ENV !== 'production' && { detail: message }),
      };
      statusCode = 500;
    }

    // ─── Guardar auditoría unificada con detalles del error ──────
    await PagoSimpleAudit.saveAuditLog({
      ...auditBase,
      statusResult: 'error',
      bancardResponse: errorResponse,
      errorCode: statusCode,
      errorMessage: error instanceof Error ? error.message : 'Error desconocido',
      errorDetail: error instanceof Error && process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      bancardMessages,
    });

    res.status(statusCode).json(errorResponse);
  }
};


// ─── 2. POST /api/bancard/rollback ─────────────────────────────────────────

export const rollback = async (
  req: Request<ParamsDictionary, unknown, RollbackRequest>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    const { shopProcessId } = req.body;
    const result = await bancardService.rollback(shopProcessId);

    const body: any = {
      status: result.status,
      message: result.status === 'success' ? 'Rollback ejecutado correctamente.' : 'Error al ejecutar rollback.',
      data: {
        shopProcessId,
        processed: result.status === 'success',
        messages: result.messages,
        rawResponse: result.rawResponse
      },
    };
    res.status(200).json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] rollback:', message);
    const body: ApiErrorResponse = {
      status: 'error',
      message: 'Error al ejecutar el rollback.',
      ...(process.env.NODE_ENV !== 'production' && { detail: message }),
    };
    res.status(500).json(body);
  }
};

// ─── 3. GET /api/bancard/confirmation/:shopProcessId ──────────────────────

export const getConfirmation = async (
  req: Request<{ shopProcessId: string }>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    const { shopProcessId } = req.params;
    const result = await bancardService.getConfirmation(shopProcessId);

    const body: ApiSuccessResponse<typeof result> = {
      status: 'success',
      data: result,
    };
    res.status(200).json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] getConfirmation:', message);
    const body: ApiErrorResponse = {
      status: 'error',
      message: 'Error al consultar la confirmación.',
      ...(process.env.NODE_ENV !== 'production' && { detail: message }),
    };
    res.status(500).json(body);
  }
};

// ─── 4. POST /api/bancard/charge-back ────────────────────────────────────

export const chargeBack = async (
  req: Request<ParamsDictionary, unknown, ChargeBackRequest>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    const { shopProcessId, amount, currency } = req.body;
    const result = await bancardService.chargeBack({ shopProcessId, amount, currency });

    const body: ApiSuccessResponse<typeof result> = {
      status: 'success',
      message: 'Contracargo procesado.',
      data: result,
    };
    res.status(200).json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] chargeBack:', message);
    const body: ApiErrorResponse = {
      status: 'error',
      message: 'Error al procesar el contracargo.',
      ...(process.env.NODE_ENV !== 'production' && { detail: message }),
    };
    res.status(500).json(body);
  }
};

// ─── 5. POST /api/bancard/confirm (Webhook) ───────────────────────────────

export const confirmWebhook = (req: Request<ParamsDictionary, unknown, BancardWebhookPayload>, res: Response): void => {
  try {
    console.log('[bancardController] Webhook recibido:', JSON.stringify(req.body, null, 2));

    const confirmation = bancardService.processConfirmationWebhook(req.body);

    // TODO: Actualizar estado del pedido en tu base de datos:
    // await OrderService.updatePaymentStatus(confirmation.shopProcessId, confirmation.status);

    console.log('[bancardController] Pago procesado:', {
      shopProcessId: confirmation.shopProcessId,
      status: confirmation.status,
      amount: confirmation.amount,
    });

    res.status(200).json({
      status: confirmation.status,
      data: { 
        shopProcessId: confirmation.shopProcessId, 
        processed: true,
        rawResponse: confirmation.rawOperation
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] Error en webhook:', message);
    res.status(500).json({ status: 'error', message: 'Error procesando confirmación.' });
  }
};

// ─── 6. GET /api/bancard/health ──────────────────────────────────────────

export const healthCheck = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    service: 'Bancard vPOS',
    environment: bancardService.adapter.getEnvironment(),
    timestamp: new Date().toISOString(),
  });
};

// ─── 7. Helpers para Visualización (Success / Fail URLs) ─────────────────────

export const paymentSuccessHandler = (req: Request, res: Response): void => {
  const query = JSON.stringify(req.query, null, 2);
  const isFail = req.query.status === 'payment_fail';

  if (isFail) {
    res.send(`
      <html>
        <head><title>Pago Fallido - Bancard</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fef2f2; color: #991b1b;">
          <h1 style="color: #b91c1c;">El pago ha fallado</h1>
          <p>Bancard redirigió a la URL de retorno, pero indicó que el pago falló (status: payment_fail).</p>
          <pre style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #fecaca; display: inline-block; text-align: left;">
${query}
          </pre>
        </body>
      </html>
    `);
    return;
  }

  res.send(`
    <html>
      <head><title>Pago Exitoso - Bancard</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0fdf4; color: #166534;">
        <h1 style="color: #15803d;">¡Pago Exitoso!</h1>
        <p>Bancard redirigió a la URL de éxito y no reportó errores.</p>
        <pre style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; display: inline-block; text-align: left;">
${query}
        </pre>
      </body>
    </html>
  `);
};

export const paymentCancelHandler = (req: Request, res: Response): void => {
  const query = JSON.stringify(req.query, null, 2);
  res.send(`
    <html>
      <head><title>Pago Cancelado / Fallido - Bancard</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fef2f2; color: #991b1b;">
        <h1 style="color: #b91c1c;">Pago Cancelado o Fallido</h1>
        <p>Bancard redirigió a la URL de cancelación/error.</p>
        <pre style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #fecaca; display: inline-block; text-align: left;">
${query}
        </pre>
      </body>
    </html>
  `);
};
