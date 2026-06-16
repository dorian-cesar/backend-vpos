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
import { generateShopProcessId } from '../utils/shopProcessIdGenerator.js';

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
    // shopProcessId se genera SIEMPRE en el backend
    const shopProcessId = generateShopProcessId();
    const { amount, currency, description, ivaAmount, billing, additionalData, returnUrl, cancelUrl } = req.body;

    const result = await bancardService.initiateSingleBuy({
      shopProcessId,
      amount,
      currency,
      description,
      ivaAmount,
      billing,
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
    shopProcessId: 0 as number, // Se sobrescribe en cada case con el ID generado internamente
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
        const { amount, currency, description, ivaAmount, billing, additionalData, returnUrl, cancelUrl } = req.body;

        if (!amount || !description) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!amount ? [{ field: 'amount', message: 'amount es requerido para single-buy.' }] : []),
              ...(!description ? [{ field: 'description', message: 'description es requerida para single-buy.' }] : []),
            ],
          });
          return;
        }

        // shopProcessId se genera SIEMPRE en el backend
        const shopProcessId = generateShopProcessId();
        console.log(`[bancardController] 🔑 shopProcessId generado internamente: ${shopProcessId}`);

        // Actualizar auditBase con el shopProcessId real generado
        auditBase.shopProcessId = shopProcessId;

        result = await bancardService.initiateSingleBuy({
          shopProcessId,
          amount,
          currency,
          description,
          ivaAmount,
          billing,
          additionalData,
          returnUrl,
          cancelUrl,
        });

        responseBody = {
          status: 'success',
          action,
          message: 'Compra iniciada exitosamente.',
          data: result,  // incluye processId, shopProcessId, rawResponse, iframeUrl, sdkUrl
        };
        break;
      }

      // ── 1.5. cards-new: iniciar catastro de tarjeta ───────────────────────
      case 'cards-new': {
        const { cardId, userId, userCellPhone, userMail, returnUrl, cancelUrl } = req.body;

        if (!cardId || !userId || !userCellPhone || !userMail) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!cardId ? [{ field: 'cardId', message: 'cardId es requerido para cards-new.' }] : []),
              ...(!userId ? [{ field: 'userId', message: 'userId es requerido para cards-new.' }] : []),
              ...(!userCellPhone ? [{ field: 'userCellPhone', message: 'userCellPhone es requerido para cards-new.' }] : []),
              ...(!userMail ? [{ field: 'userMail', message: 'userMail es requerido para cards-new.' }] : []),
            ],
          });
          return;
        }

        result = await bancardService.initiateCardsNew({
          cardId,
          userId,
          userCellPhone,
          userMail,
          returnUrl,
          cancelUrl,
        });

        responseBody = {
          status: 'success',
          action,
          message: 'Catastro de tarjeta iniciado exitosamente.',
          data: result,  // ya incluye rawResponse via initiateCardsNew
        };
        break;
      }

      // ── 1.6. list-cards: listar tarjetas catastradas ──────────────────────
      case 'list-cards': {
        const { userId } = req.body;

        if (!userId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'userId', message: 'userId es requerido para list-cards.' }],
          });
          return;
        }

        result = await bancardService.listCards(userId);

        responseBody = {
          status: 'success',
          action,
          message: 'Listado de tarjetas obtenido exitosamente.',
          data: {
            userId,
            rawResponse: result,
            cards: (result as any)?.cards ?? [],
            messages: (result as any)?.messages ?? [],
          },
        };
        break;
      }

      // ── 1.7. charge: cobrar directamente con tarjeta guardada (alias_token) ───
      case 'charge': {
        const { amount, currency, description, aliasToken, additionalData, numberOfPayments } = req.body;

        if (!amount || !description || !aliasToken) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!amount ? [{ field: 'amount', message: 'amount es requerido para charge.' }] : []),
              ...(!description ? [{ field: 'description', message: 'description es requerida para charge.' }] : []),
              ...(!aliasToken ? [{ field: 'aliasToken', message: 'aliasToken es requerido para charge.' }] : []),
            ],
          });
          return;
        }

        // shopProcessId también se genera en el backend para 'charge'
        const chargeShopProcessId = generateShopProcessId();
        console.log(`[bancardController] 🔑 shopProcessId generado para charge: ${chargeShopProcessId}`);
        auditBase.shopProcessId = chargeShopProcessId;

        const chargeResult = await bancardService.charge({
          shopProcessId: chargeShopProcessId,
          amount,
          currency,
          description,
          aliasToken,
          additionalData,
          numberOfPayments,
        });
        result = chargeResult;

        responseBody = {
          status: chargeResult.status,
          action,
          message: chargeResult.status === 'success' ? 'Pago con tarjeta guardada procesado.' : 'Pago pendiente de confirmación (débito).',
          data: {
            shopProcessId: chargeShopProcessId,
            status: chargeResult.status,
            confirmation: chargeResult.confirmation,
            messages: chargeResult.messages,
            rawResponse: chargeResult.rawResponse,
            ...(chargeResult.iframeUrl ? { iframeUrl: chargeResult.iframeUrl } : {}),
          },
        };
        break;
      }

      // ── 1.8. delete-card: eliminar una tarjeta catastrada ───────────────────
      case 'delete-card': {
        const { userId, aliasToken } = req.body;

        if (!userId || !aliasToken) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!userId ? [{ field: 'userId', message: 'userId es requerido para delete-card.' }] : []),
              ...(!aliasToken ? [{ field: 'aliasToken', message: 'aliasToken es requerido para delete-card.' }] : []),
            ],
          });
          return;
        }

        const deleteResult = await bancardService.deleteCard({
          userId,
          aliasToken,
        });
        result = deleteResult;

        responseBody = {
          status: deleteResult.status,
          action,
          message: deleteResult.status === 'success' ? 'Tarjeta eliminada exitosamente.' : 'No se pudo eliminar la tarjeta.',
          data: {
            userId,
            status: deleteResult.status,
            messages: deleteResult.messages,
            rawResponse: deleteResult.rawResponse,
          },
        };
        break;
      }

      // ── 2. rollback: revertir transacción pendiente ───────────────────────
      case 'rollback': {
        const { processId } = req.body;

        if (!processId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'processId', message: 'processId (de Bancard) es requerido para rollback.' }],
          });
          return;
        }

        // Resolver shopProcessId desde la BD de auditoría
        const rollbackShopId = await PagoSimpleAudit.lookupShopProcessId(processId);
        if (!rollbackShopId) {
          res.status(422).json({
            status: 'error',
            message: `No se encontró un shopProcessId asociado al processId "${processId}". Verifique que la transacción fue iniciada correctamente.`,
          });
          return;
        }

        console.log(`[bancardController] 🔍 Rollback: processId=${processId} → shopProcessId=${rollbackShopId}`);
        auditBase.shopProcessId = rollbackShopId;

        const rollbackResult = await bancardService.rollback(rollbackShopId);
        result = rollbackResult;

        responseBody = {
          status: rollbackResult.status,
          action,
          message: rollbackResult.status === 'success' ? 'Rollback ejecutado correctamente.' : 'Error al ejecutar rollback.',
          data: {
            processId,
            shopProcessId: rollbackShopId,
            processed: rollbackResult.status === 'success',
            messages: rollbackResult.messages,
            rawResponse: rollbackResult.rawResponse
          },
        };
        break;
      }

      // ── 3. confirmation: consultar estado de una transacción ──────────────
      case 'confirmation': {
        const { processId } = req.body;

        if (!processId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'processId', message: 'processId (de Bancard) es requerido para confirmation.' }],
          });
          return;
        }

        // Resolver shopProcessId desde la BD de auditoría
        const confirmShopId = await PagoSimpleAudit.lookupShopProcessId(processId);
        if (!confirmShopId) {
          res.status(422).json({
            status: 'error',
            message: `No se encontró un shopProcessId asociado al processId "${processId}". Verifique que la transacción fue iniciada correctamente.`,
          });
          return;
        }

        console.log(`[bancardController] 🔍 Confirmation: processId=${processId} → shopProcessId=${confirmShopId}`);
        auditBase.shopProcessId = confirmShopId;

        const confirmationResult = await bancardService.getConfirmation(confirmShopId);
        result = confirmationResult;

        responseBody = {
          status: 'success',
          action,
          message: 'Confirmación obtenida correctamente.',
          data: {
            processId,
            shopProcessId: confirmShopId,
            status: confirmationResult.status,
            confirmation: confirmationResult.confirmation,
            messages: confirmationResult.messages,
            rawResponse: confirmationResult.rawResponse,
          },
        };
        break;
      }

      // ── 4. charge-back: devolución de un pago aprobado ───────────────────
      case 'charge-back': {
        const { processId, amount, currency } = req.body;

        if (!processId || !amount) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!processId ? [{ field: 'processId', message: 'processId (de Bancard) es requerido para charge-back.' }] : []),
              ...(!amount ? [{ field: 'amount', message: 'amount es requerido para charge-back.' }] : []),
            ],
          });
          return;
        }

        // Resolver shopProcessId desde la BD de auditoría
        const chargeBackShopId = await PagoSimpleAudit.lookupShopProcessId(processId);
        if (!chargeBackShopId) {
          res.status(422).json({
            status: 'error',
            message: `No se encontró un shopProcessId asociado al processId "${processId}". Verifique que la transacción fue iniciada correctamente.`,
          });
          return;
        }

        console.log(`[bancardController] 🔍 Charge-back: processId=${processId} → shopProcessId=${chargeBackShopId}`);
        auditBase.shopProcessId = chargeBackShopId;

        const chargeBackResult = await bancardService.chargeBack({ shopProcessId: chargeBackShopId, amount, currency });
        result = chargeBackResult;

        responseBody = {
          status: 'success',
          action,
          message: 'Contracargo procesado correctamente.',
          data: {
            processId,
            shopProcessId: chargeBackShopId,
            status: chargeBackResult.status,
            messages: chargeBackResult.messages,
            rawResponse: chargeBackResult.rawResponse,
          },
        };
        break;
      }

      // ── 5. cancel-billing: cancelar una factura electrónica generada ──────
      case 'cancel-billing': {
        const { processId, clientRuc } = req.body;

        if (!processId || !clientRuc) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!processId ? [{ field: 'processId', message: 'processId es requerido para cancel-billing.' }] : []),
              ...(!clientRuc ? [{ field: 'clientRuc', message: 'clientRuc es requerido para cancel-billing.' }] : []),
            ],
          });
          return;
        }

        // Resolver shopProcessId desde la BD de auditoría
        const cancelBillingShopId = await PagoSimpleAudit.lookupShopProcessId(processId);
        if (!cancelBillingShopId) {
          res.status(422).json({
            status: 'error',
            message: `No se encontró un shopProcessId asociado al processId "${processId}". Verifique que la transacción fue iniciada correctamente.`,
          });
          return;
        }

        console.log(`[bancardController] 🔍 Cancel-billing: processId=${processId} → shopProcessId=${cancelBillingShopId}`);
        auditBase.shopProcessId = cancelBillingShopId;

        const cancelBillingResult = await bancardService.cancelBilling({ shopProcessId: cancelBillingShopId, clientRuc });
        result = cancelBillingResult;

        responseBody = {
          status: cancelBillingResult.status,
          action,
          message: cancelBillingResult.status === 'success' ? 'Factura electrónica cancelada exitosamente.' : 'Error al cancelar la factura electrónica.',
          data: {
            processId,
            shopProcessId: cancelBillingShopId,
            status: cancelBillingResult.status,
            messages: cancelBillingResult.messages,
            rawResponse: cancelBillingResult.rawResponse,
          },
        };
        break;
      }

      // ── 10. preauth-confirm: Confirmar preautorización ──────────────────────────
      case 'preauth-confirm': {
        const { processId, amount, billing } = req.body;
        if (!processId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'processId', message: 'processId es requerido para preauth-confirm.' }],
          });
          return;
        }

        const auditRecord = await PagoSimpleAudit.findLatestByProcessId(processId);
        if (!auditRecord) {
          res.status(404).json({
            status: 'error',
            message: `No se encontró transacción original con processId ${processId}`,
          });
          return;
        }

        const preauthShopId = auditRecord.shopProcessId;
        auditBase.shopProcessId = preauthShopId;

        const preauthResult = await bancardService.preauthorizationConfirm({
          shopProcessId: preauthShopId,
          amount,
          billing,
        });

        result = preauthResult;
        responseBody = {
          status: 'success',
          message: 'Preautorización confirmada correctamente.',
          data: {
            processId,
            shopProcessId: preauthShopId,
            status: preauthResult.status,
            confirmation: preauthResult.confirmation,
            messages: preauthResult.messages,
            rawResponse: preauthResult.rawResponse,
          },
        };
        break;
      }

      // ── 11. client-info: Obtener Razón Social por RUC ───────────────────────
      case 'client-info': {
        const { clientRuc } = req.body;
        if (!clientRuc) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [{ field: 'clientRuc', message: 'clientRuc es requerido para client-info.' }],
          });
          return;
        }

        // shopProcessId no es requerido para client-info, asignamos un dummy
        auditBase.shopProcessId = generateShopProcessId();

        const infoResult = await bancardService.getClientInfo({ clientRuc });

        result = infoResult;
        responseBody = {
          status: 'success',
          message: 'Datos de cliente obtenidos correctamente.',
          data: {
            status: infoResult.status,
            client: infoResult.client,
            messages: infoResult.messages,
            rawResponse: infoResult.rawResponse,
          },
        };
        break;
      }

      // ── Acción desconocida (no debería llegar aquí por la validación) ─────
      default: {
        res.status(422).json({
          status: 'error',
          message: `Acción no reconocida: "${action}". Valores válidos: single-buy, rollback, confirmation, charge-back, cards-new, list-cards, charge, delete-card, cancel-billing, preauth-confirm, client-info.`,
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
