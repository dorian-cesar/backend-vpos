/**
 * bancardController.ts
 * Controladores Express tipados para los endpoints de Bancard vPOS.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { validationResult } from 'express-validator';
import { BancardService, BancardApiError } from '../services/BancardService';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  BancardWebhookPayload,
  ChargeBackRequest,
  RollbackRequest,
  SingleBuyRequest,
  PagoSimpleRequest,
} from '../types/bancard.types';
import { PagoSimpleAudit } from '../models/PagoSimpleAudit';

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

// ─── 1.B POST /api/bancard/pagosimple ───────────────────────────────────────

export const initiatePagoSimple = async (
  req: Request<ParamsDictionary, unknown, PagoSimpleRequest>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    const { shopProcessId, amount, currency, description, additionalData, returnUrl, cancelUrl, servicio, canal, id } = req.body;

    const result = await bancardService.initiateSingleBuy({
      shopProcessId,
      amount,
      currency,
      description,
      additionalData,
      returnUrl,
      cancelUrl,
    });

    // Guardar auditoría exitosa
    await PagoSimpleAudit.saveAuditLog({
      externalId: id,
      servicio,
      canal,
      shopProcessId,
      amount,
      requestPayload: req.body,
      bancardResponse: result.rawResponse
    });

    const body: ApiSuccessResponse<typeof result> = {
      status: 'success',
      message: 'Compra iniciada exitosamente.',
      data: result,
    };
    res.status(200).json(body);
  } catch (error) {
    let errorResponse: any;
    let statusCode = 500;

    if (error instanceof BancardApiError) {
      errorResponse = {
        status: 'error',
        message: error.message,
        bancardMessages: error.bancardMessages,
      };
      statusCode = 400;
    } else {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      errorResponse = {
        status: 'error',
        message: 'Error interno del servidor al comunicarse con Bancard.',
        ...(process.env.NODE_ENV !== 'production' && { detail: message }),
      };
    }

    // Guardar auditoría fallida
    await PagoSimpleAudit.saveAuditLog({
      externalId: req.body.id,
      servicio: req.body.servicio,
      canal: req.body.canal,
      shopProcessId: req.body.shopProcessId,
      amount: req.body.amount,
      requestPayload: req.body,
      bancardResponse: errorResponse
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

    const body: ApiSuccessResponse<typeof result> = {
      status: 'success',
      message: 'Rollback ejecutado.',
      data: result,
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
      status: 'success',
      data: { shopProcessId: confirmation.shopProcessId, processed: true },
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
