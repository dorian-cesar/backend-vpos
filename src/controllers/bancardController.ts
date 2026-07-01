/**
 * bancardController.ts
 * Controladores Express tipados para los endpoints de Bancard vPOS.
 *
 * Responsabilidades:
 * - Validar el request (via express-validator)
 * - Orquestar la llamada al servicio correspondiente
 * - Construir la respuesta tipada (usando los DTOs de respuesta)
 * - Guardar auditoría en BD
 *
 * Para los contratos exactos de entrada/salida, ver: src/dtos/
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { validationResult } from 'express-validator';
import { BancardService, BancardApiError } from '../services/BancardService.js';
import type { BancardWebhookPayload, BancardBilling } from '../types/bancard.types.js';
import type { ApiErrorResponse, ApiSuccessResponse } from '../types/api.types.js';
import type { PagoSimpleLooseDto, LegacyRollbackRequestDto, LegacyChargeBackRequestDto, SingleBuyDto } from '../dtos/requests/pagoSimple.request.dto.js';
import type {
  ApiSuccessDto,
  ApiErrorDto,
  HealthCheckResponseDto,
} from '../dtos/responses/pagoSimple.response.dto.js';
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

// ─── Helper: valida la sumatoria de los items de facturación ─────────────────

const validateBillingAmounts = (amount: number, billing?: BancardBilling): string | null => {
  if (!billing || !billing.details || billing.details.length === 0) return null;
  const totalDetails = billing.details.reduce((sum, detail) => sum + Number(detail.amount), 0);
  if (Math.abs(Number(amount) - totalDetails) > 0.001) {
    return `El costo total de los ítems en billing.details (${totalDetails.toFixed(2)}) debe coincidir con el monto principal enviado (${Number(amount).toFixed(2)}).`;
  }
  return null;
};

// ─── 1. POST /api/bancard/single-buy ───────────────────────────────────────

export const initiateSingleBuy = async (
  req: Request<ParamsDictionary, unknown, SingleBuyDto>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  try {
    // shopProcessId se genera SIEMPRE en el backend
    const shopProcessId = generateShopProcessId((req.body as any).canal);
    const { amount, currency, description, billing, additionalData, preauthorization, zimple } = req.body;
    const returnUrl = req.body.returnUrl || (req.body as any).return_url;
    const cancelUrl = req.body.cancelUrl || (req.body as any).cancel_url;

    const billingError = validateBillingAmounts(Number(amount), billing);
    if (billingError) {
      const body: ApiErrorResponse = {
        status: 'error',
        message: 'Datos de facturación inválidos.',
        errors: [{ field: 'billing.details', message: billingError }],
      };
      res.status(422).json(body);
      return;
    }

    const result = await bancardService.initiateSingleBuy({
      shopProcessId,
      amount,
      currency,
      description,
      billing,
      additionalData,
      preauthorization,
      zimple,
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
  req: Request<Record<string, never>, unknown, PagoSimpleLooseDto>,
  res: Response,
): Promise<void> => {
  if (!checkValidation(req, res)) return;

  const { action, servicio, canal, id } = req.body;
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined;
  let result: unknown = null;
  let statusCode = 200;
  let responseBody: ApiSuccessDto | ApiErrorDto | null = null;

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
        const { amount, currency, description, billing, additionalData, preauthorization, zimple } = req.body;
        const returnUrl = req.body.returnUrl || (req.body as any).return_url;
        const cancelUrl = req.body.cancelUrl || (req.body as any).cancel_url;

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

        const billingError = validateBillingAmounts(Number(amount), billing);
        if (billingError) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de facturación inválidos.',
            errors: [{ field: 'billing.details', message: billingError }],
          });
          return;
        }

        // shopProcessId se genera SIEMPRE en el backend
        const shopProcessId = generateShopProcessId(canal);
        console.log(`[bancardController] 🔑 shopProcessId generado internamente: ${shopProcessId}`);

        // Actualizar auditBase con el shopProcessId real generado
        auditBase.shopProcessId = shopProcessId;

        // ⚠️  returnUrl / cancelUrl: Bancard redirigirá al usuario a estas URLs
        // tras completar el pago en el iframe. DEBEN ser rutas propias del frontend
        // (ej: /pago/exitoso, /pago/cancelado). Si no se envían, se usa el fallback
        // del .env que apunta a rutas del backend (solo útil para testing).
        if (!returnUrl) {
          console.warn(`[bancardController] ⚠️  single-buy sin returnUrl — se usará el fallback del .env. Asegúrese de que el frontend envíe su propia URL de confirmación.`);
        }

        const singleBuyResult = await bancardService.initiateSingleBuy({
          shopProcessId,
          amount,
          currency,
          description,
          billing,
          additionalData,
          preauthorization,
          zimple,
          returnUrl,
          cancelUrl,
        });
        result = singleBuyResult;

        responseBody = {
          status: 'success',
          action,
          message: 'Compra iniciada exitosamente.',
          data: {
            processId: singleBuyResult.processId,
            shopProcessId: shopProcessId,
            iframeUrl: singleBuyResult.iframeUrl,
            sdkUrl: singleBuyResult.sdkUrl,
            environment: singleBuyResult.environment,
          },
        };
        break;
      }

      // ── 1.5. cards-new: iniciar catastro de tarjeta ───────────────────────
      case 'cards-new': {
        const { cardId, userId, userCellPhone, userMail } = req.body;
        const returnUrl = req.body.returnUrl || (req.body as any).return_url;
        const cancelUrl = req.body.cancelUrl || (req.body as any).cancel_url;

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

        if (!returnUrl) {
          console.warn(`[bancardController] ⚠️  cards-new sin returnUrl — se usará el fallback del .env.`);
        }

        const cardsNewResult = await bancardService.initiateCardsNew({
          cardId,
          userId,
          userCellPhone,
          userMail,
          returnUrl,
          cancelUrl,
        });
        result = cardsNewResult;

        responseBody = {
          status: 'success',
          action,
          message: 'Catastro de tarjeta iniciado exitosamente.',
          data: {
            processId: (cardsNewResult as any)?.processId ?? '',
            iframeUrl: (cardsNewResult as any)?.iframeUrl ?? '',
            sdkUrl: (cardsNewResult as any)?.sdkUrl ?? '',
            environment: (cardsNewResult as any)?.environment ?? '',
          },
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
        const chargeShopProcessId = generateShopProcessId(canal);
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
          status: 'success' as const,
          action,
          message: chargeResult.status === 'success' ? 'Pago con tarjeta guardada procesado.' : 'Pago pendiente de confirmación (débito).',
          data: {
            status: chargeResult.status,
            confirmation: chargeResult.confirmation ? {
              responseCode: chargeResult.confirmation.response_code,
              responseDescription: chargeResult.confirmation.response_description,
              ticketNumber: chargeResult.confirmation.ticket_number,
              authorizationNumber: chargeResult.confirmation.authorization_number,
              amount: chargeResult.confirmation.amount,
              currency: chargeResult.confirmation.currency,
              cardBrand: chargeResult.confirmation.card_brand,
              cardMaskedNumber: chargeResult.confirmation.card_masked_number,
            } : null,
            messages: chargeResult.messages,
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
          status: 'success' as const,
          action,
          message: deleteResult.status === 'success' ? 'Tarjeta eliminada exitosamente.' : 'No se pudo eliminar la tarjeta.',
          data: {
            status: deleteResult.status,
            messages: deleteResult.messages,
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
          status: 'success' as const,
          action,
          message: rollbackResult.status === 'success' ? 'Rollback ejecutado correctamente.' : 'Error al ejecutar rollback.',
          data: {
            processId,
            processed: rollbackResult.status === 'success',
            messages: rollbackResult.messages,
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

        // Recuperar el invoice_number persistido por el Webhook (ya que GET de Bancard podría no incluirlo)
        const savedInvoiceNumber = await PagoSimpleAudit.getInvoiceNumber(confirmShopId);

        responseBody = {
          status: 'success',
          action,
          message: 'Confirmación obtenida correctamente.',
          data: {
            processId,
            status: confirmationResult.status,
            confirmation: confirmationResult.confirmation ? {
              responseCode: confirmationResult.confirmation.response_code,
              responseDescription: confirmationResult.confirmation.response_description,
              ticketNumber: confirmationResult.confirmation.ticket_number,
              authorizationNumber: confirmationResult.confirmation.authorization_number,
              amount: confirmationResult.confirmation.amount,
              currency: confirmationResult.confirmation.currency,
              cardBrand: confirmationResult.confirmation.card_brand,
              cardMaskedNumber: confirmationResult.confirmation.card_masked_number,
              electronicBillNumber: confirmationResult.confirmation.billing_response?.data?.invoice_number
                || confirmationResult.confirmation.vpos_electronic_bill?.invoice_number
                || savedInvoiceNumber,
              electronicBillCdc: confirmationResult.confirmation.vpos_electronic_bill?.cdc,
            } : null,
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
            status: chargeBackResult.status,
            messages: chargeBackResult.messages,
          },
        };
        break;
      }

      // ── 5. cancel-billing: cancelar una factura electrónica generada ──────
      case 'cancel-billing': {
        const { shopProcessId } = req.body;

        if (!shopProcessId) {
          res.status(422).json({
            status: 'error',
            message: 'Datos de entrada inválidos.',
            errors: [
              ...(!shopProcessId ? [{ field: 'shopProcessId', message: 'shopProcessId es requerido para cancel-billing.' }] : []),
            ],
          });
          return;
        }

        console.log(`[bancardController] 🔍 Cancel-billing: shopProcessId=${shopProcessId}`);
        auditBase.shopProcessId = Number(shopProcessId);

        const cancelBillingResult = await bancardService.cancelBilling({ shopProcessId });
        result = cancelBillingResult;

        responseBody = {
          status: 'success' as const,
          action,
          message: cancelBillingResult.status === 'success' ? 'Factura electrónica cancelada exitosamente.' : 'Error al cancelar la factura electrónica.',
          data: {
            shopProcessId,
            status: cancelBillingResult.status,
            messages: cancelBillingResult.messages,
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

        if (amount !== undefined) {
          const billingError = validateBillingAmounts(Number(amount), billing);
          if (billingError) {
            res.status(422).json({
              status: 'error',
              message: 'Datos de facturación inválidos.',
              errors: [{ field: 'billing.details', message: billingError }],
            });
            return;
          }
        }

        const preauthShopId = await PagoSimpleAudit.lookupShopProcessId(processId);
        if (!preauthShopId) {
          res.status(404).json({
            status: 'error',
            message: `No se encontró transacción original con processId ${processId}`,
          });
          return;
        }

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
            confirmation: preauthResult.confirmation ? {
              responseCode: preauthResult.confirmation.response_code,
              responseDescription: preauthResult.confirmation.response_description,
              ticketNumber: preauthResult.confirmation.ticket_number,
              authorizationNumber: preauthResult.confirmation.authorization_number,
              amount: preauthResult.confirmation.amount,
              currency: preauthResult.confirmation.currency,
              cardBrand: preauthResult.confirmation.card_brand,
              cardMaskedNumber: preauthResult.confirmation.card_masked_number,
            } : null,
            messages: preauthResult.messages,
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
        auditBase.shopProcessId = generateShopProcessId(canal);

        const infoResult = await bancardService.getClientInfo({ clientRuc });

        result = infoResult;
        responseBody = {
          status: 'success',
          message: 'Datos de cliente obtenidos correctamente.',
          data: {
            clientName: infoResult.client?.name,
            clientEmail: infoResult.client?.email,
            messages: infoResult.messages,
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

    console.log(`[bancardController] ◄ Respuesta enviada al frontend (action: ${action}):`);
    console.log(JSON.stringify(responseBody, null, 2));
    console.log('──────────────────────────────────────────────────────────────');

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

    console.log(`[bancardController] ◄ Respuesta de ERROR enviada al frontend (action: ${action}):`);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log('──────────────────────────────────────────────────────────────');

    res.status(statusCode).json(errorResponse);
  }
};


// ─── 2. POST /api/bancard/rollback ─────────────────────────────────────────

export const rollback = async (
  req: Request<ParamsDictionary, unknown, LegacyRollbackRequestDto>,
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

    // Recuperar el invoice_number persistido por el Webhook (ya que GET de Bancard podría no incluirlo)
    const savedInvoiceNumber = await PagoSimpleAudit.getInvoiceNumber(shopProcessId);

    const mappedData = {
      status: result.status,
      confirmation: result.confirmation ? {
        responseCode: result.confirmation.response_code,
        responseDescription: result.confirmation.response_description,
        ticketNumber: result.confirmation.ticket_number,
        authorizationNumber: result.confirmation.authorization_number,
        amount: result.confirmation.amount,
        currency: result.confirmation.currency,
        cardBrand: result.confirmation.card_brand,
        cardMaskedNumber: result.confirmation.card_masked_number,
        electronicBillNumber: result.confirmation.billing_response?.data?.invoice_number
          || result.confirmation.vpos_electronic_bill?.invoice_number
          || savedInvoiceNumber,
        electronicBillCdc: result.confirmation.vpos_electronic_bill?.cdc,
      } : null,
      messages: result.messages,
      rawResponse: result.rawResponse,
    };

    const body: ApiSuccessResponse<typeof mappedData> = {
      status: 'success',
      data: mappedData,
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
  req: Request<ParamsDictionary, unknown, LegacyChargeBackRequestDto>,
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

export const confirmWebhook = async (req: Request<ParamsDictionary, unknown, BancardWebhookPayload>, res: Response): Promise<void> => {
  try {
    console.log('[bancardController] Webhook recibido:', JSON.stringify(req.body, null, 2));

    const confirmation = bancardService.processConfirmationWebhook(req.body);

    // TODO: Actualizar estado del pedido en tu base de datos:
    // await OrderService.updatePaymentStatus(confirmation.shopProcessId, confirmation.status);

    // Recuperar el bancard_process_id real para mantener la consistencia en el log de auditoría
    const realBancardProcessId = await PagoSimpleAudit.lookupBancardProcessId(confirmation.shopProcessId);

    // Guardar la transacción en la auditoría incluyendo el invoice_number
    await PagoSimpleAudit.saveAuditLog({
      action: 'webhook-confirmation',
      shopProcessId: confirmation.shopProcessId,
      amount: confirmation.amount,
      currency: confirmation.currency,
      bancardProcessId: realBancardProcessId || undefined,
      statusResult: confirmation.status,
      invoiceNumber: confirmation.electronicBillNumber,
      bancardResponse: req.body,
    });

    console.log('[bancardController] Pago procesado (Webhook):', {
      shopProcessId: confirmation.shopProcessId,
      status: confirmation.status,
      amount: confirmation.amount,
      invoiceNumber: confirmation.electronicBillNumber,
    });

    // Bancard requires strictly {"status": "success"} to acknowledge the webhook
    res.status(200).json({ status: 'success' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] Error en webhook:', message);

    // Registrar error del webhook si es posible
    await PagoSimpleAudit.saveAuditLog({
      action: 'webhook-confirmation',
      statusResult: 'error',
      bancardResponse: req.body,
      errorCode: 500,
      errorMessage: message,
    }).catch(e => console.error('[bancardController] Error guardando log de fallo:', e));

    res.status(500).json({ status: 'error', message: 'Error procesando confirmación.' });
  }
};

// ─── 4.5. Operaciones Puras adicionales ───────────────────────────────────

export const getClientInfoPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { clientRuc } = req.body;
    const result = await bancardService.getClientInfo({ clientRuc });
    res.status(200).json({
      status: 'success',
      message: 'Datos de cliente obtenidos.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] getClientInfoPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al consultar cliente.', detail: message });
  }
};

export const cancelBillingPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { shopProcessId } = req.body;
    const result = await bancardService.cancelBilling({ shopProcessId });
    res.status(200).json({
      status: 'success',
      message: 'Operación de cancelación procesada.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] cancelBillingPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al cancelar factura.', detail: message });
  }
};

export const cardsNewPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { cardId, userId, userCellPhone, userMail, returnUrl, cancelUrl } = req.body;
    const result = await bancardService.initiateCardsNew({
      cardId,
      userId,
      userCellPhone,
      userMail,
      returnUrl,
      cancelUrl
    });
    res.status(200).json({
      status: 'success',
      message: 'Proceso de catastro iniciado.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] cardsNewPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al iniciar catastro de tarjeta.', detail: message });
  }
};

export const listCardsPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { userId } = req.params; // from url params
    const result = await bancardService.listCards(Number(userId));
    res.status(200).json({
      status: 'success',
      message: 'Tarjetas listadas.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] listCardsPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al listar tarjetas.', detail: message });
  }
};

export const chargePure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { amount, currency, description, aliasToken, additionalData, numberOfPayments } = req.body;
    const chargeShopProcessId = generateShopProcessId('pure-charge');
    const result = await bancardService.charge({
      shopProcessId: chargeShopProcessId,
      amount,
      currency,
      description,
      aliasToken,
      additionalData,
      numberOfPayments
    });
    res.status(200).json({
      status: 'success',
      message: 'Pago con tarjeta guardada procesado.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] chargePure:', message);
    res.status(500).json({ status: 'error', message: 'Error al procesar pago con alias.', detail: message });
  }
};

export const deleteCardPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { userId, aliasToken } = req.params;
    const result = await bancardService.deleteCard({
      userId: Number(userId),
      aliasToken
    });
    res.status(200).json({
      status: 'success',
      message: 'Tarjeta eliminada.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] deleteCardPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al eliminar tarjeta.', detail: message });
  }
};

export const preauthConfirmPure = async (req: Request, res: Response): Promise<void> => {
  if (!checkValidation(req, res)) return;
  try {
    const { shopProcessId, amount, billing } = req.body;
    const result = await bancardService.preauthorizationConfirm({
      shopProcessId,
      amount,
      billing
    });
    res.status(200).json({
      status: 'success',
      message: 'Preautorización confirmada.',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[bancardController] preauthConfirmPure:', message);
    res.status(500).json({ status: 'error', message: 'Error al confirmar preautorización.', detail: message });
  }
};

// ─── 6. GET /api/bancard/health ──────────────────────────────────────────

export const healthCheck = (_req: Request, res: Response): void => {
  const body: HealthCheckResponseDto = {
    status: 'ok',
    service: 'Bancard vPOS',
    environment: bancardService.adapter.getEnvironment(),
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(body);
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
