/**
 * BancardService.ts
 * Capa de servicio que orquesta la integración con Bancard vPOS.
 *
 * Responsabilidades:
 * 1. Selecciona la Strategy apropiada según NODE_ENV (Strategy Pattern)
 * 2. Instancia BancardHttpAdapter con esa estrategia (Adapter Pattern)
 * 3. Expone métodos de negocio tipados a los controladores
 */

import bancardConfig from '../config/bancard.config.js';
import { BancardStagingStrategy } from '../strategies/BancardStagingStrategy.js';
import { BancardProductionStrategy } from '../strategies/BancardProductionStrategy.js';
import { BancardHttpAdapter } from '../adapters/BancardHttpAdapter.js';
import { BancardMockAdapter } from '../adapters/BancardMockAdapter.js';
import type {
  BancardCurrency,
  BancardMessage,
  BancardWebhookPayload,
  ChargeBackResult,
  ChargeResult,
  ConfirmationResult,
  ProcessedConfirmation,
  RollbackResult,
  SingleBuyParams,
  SingleBuyResult,
  IBancardAdapter,
  ChargeParams,
  DeleteCardParams,
  DeleteCardResult,
  CancelBillingParams,
  CancelBillingResult,
} from '../types/bancard.types.js';

// ─── Error personalizado ──────────────────────────────────────────────────────

export class BancardApiError extends Error {
  public readonly bancardMessages: BancardMessage[];
  public readonly rawResponse: unknown;

  constructor(message: string, rawResponse: unknown, messages: BancardMessage[] = []) {
    super(message);
    this.name = 'BancardApiError';
    this.rawResponse = rawResponse;
    this.bancardMessages = messages;
  }
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export class BancardService {
  public readonly adapter: IBancardAdapter;

  constructor() {
    const isMock = process.env.USE_MOCK_BANCARD === 'true';

    if (isMock) {
      this.adapter = new BancardMockAdapter();
      console.log(`[BancardService] Entorno: MOCK (Simulador local)`);
      return;
    }

    // ─── Strategy: selección automática por entorno ─────────────────────────
    const isProduction = process.env.NODE_ENV === 'production';
    const strategy = isProduction
      ? new BancardProductionStrategy(bancardConfig)
      : new BancardStagingStrategy(bancardConfig);

    // ─── Adapter: inicializado con la estrategia activa ─────────────────────
    this.adapter = new BancardHttpAdapter(strategy);

    console.log(`[BancardService] Entorno: ${strategy.getEnvironmentName().toUpperCase()}`);
    console.log(`[BancardService] URL base: ${strategy.getBaseUrl()}`);
  }

  // ─── Compra Simple ──────────────────────────────────────────────────────────

  /**
   * Inicia una nueva compra simple con Bancard.
   * @returns `processId`, `iframeUrl`, `status` y `environment`.
   */
  async initiateSingleBuy(paymentData: SingleBuyParams): Promise<SingleBuyResult> {
    const {
      shopProcessId,
      amount,
      currency = bancardConfig.defaultCurrency as BancardCurrency,
      description,
      ivaAmount,
      billing,
      additionalData,
      returnUrl,
      cancelUrl,
    } = paymentData;

    const bancardResponse = await this.adapter.singleBuy({
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

    const processId = bancardResponse.process_id;
    const status = bancardResponse.status;

    if (status !== 'success' || !processId) {
      throw new BancardApiError(
        'Error al iniciar la compra con Bancard.',
        bancardResponse,
        bancardResponse.messages ?? [],
      );
    }

    return {
      processId,
      shopProcessId: Number(shopProcessId),
      iframeUrl: this.adapter.getIframeUrl(processId),
      sdkUrl: this.adapter.getSdkUrl(),
      status,
      environment: this.adapter.getEnvironment() as 'staging' | 'production',
      rawResponse: bancardResponse,
    };
  }

  // ─── Catastro de Tarjetas (Cards New) ──────────────────────────────────────

  /**
   * Inicia el proceso de catastro de una tarjeta.
   */
  async initiateCardsNew(params: import('../types/bancard.types.js').CardsNewParams): Promise<import('../types/bancard.types.js').CardsNewResult> {
    const bancardResponse = await this.adapter.cardsNew(params);

    const processId = bancardResponse.process_id;
    const status = bancardResponse.status;

    if (status !== 'success' || !processId) {
      throw new BancardApiError(
        'Error al iniciar el catastro de tarjeta con Bancard.',
        bancardResponse,
        bancardResponse.messages ?? [],
      );
    }

    return {
      processId,
      status,
      environment: this.adapter.getEnvironment() as 'staging' | 'production',
      rawResponse: bancardResponse,
    };
  }

  // ─── Listado de Tarjetas ────────────────────────────────────────────────────

  /**
   * Obtiene la lista de tarjetas catastradas de un usuario.
   */
  async listCards(userId: number | string): Promise<any> {
    const bancardResponse = await this.adapter.listCards({ userId });
    return bancardResponse;
  }

  // ─── Rollback ───────────────────────────────────────────────────────────────

  /**
   * Revierte una transacción que no fue confirmada.
   */
  async rollback(shopProcessId: number | string): Promise<RollbackResult> {
    const bancardResponse = await this.adapter.rollback({ shopProcessId });

    return {
      status: bancardResponse.status,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
    };
  }

  // ─── Consulta de Confirmación ───────────────────────────────────────────────

  /**
   * Consulta el estado actual de una transacción.
   */
  async getConfirmation(shopProcessId: number | string): Promise<ConfirmationResult> {
    const bancardResponse = await this.adapter.getConfirmation({ shopProcessId });

    return {
      status: bancardResponse.status,
      confirmation: bancardResponse.confirmation ?? null,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
    };
  }

  // ─── Contracargo ────────────────────────────────────────────────────────────

  /**
   * Realiza un contracargo (devolución) de una transacción aprobada.
   */
  async chargeBack(params: {
    shopProcessId: number | string;
    amount: number | string;
    currency?: BancardCurrency;
  }): Promise<ChargeBackResult> {
    const { shopProcessId, amount, currency = bancardConfig.defaultCurrency as BancardCurrency } = params;
    const bancardResponse = await this.adapter.chargeBack({ shopProcessId, amount, currency });

    return {
      status: bancardResponse.status,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
    };
  }

  // ─── Pago con Alias (Charge) ──────────────────────────────────────────────

  /**
   * Procesa un cobro directo con una tarjeta catastrada usando su alias_token.
   * Para débito, puede retornar un process_id para mostrar el iframe de PIN.
   */
  async charge(params: ChargeParams): Promise<ChargeResult> {
    const bancardResponse = await this.adapter.charge(params);

    // Para tarjetas de débito, Bancard devuelve un process_id y status 'process_pending'
    // lo que significa que el usuario debe ingresar su PIN en el iframe.
    const iframeUrl = bancardResponse.process_id
      ? this.adapter.getIframeUrl(bancardResponse.process_id)
      : undefined;

    return {
      status: bancardResponse.status,
      confirmation: bancardResponse.confirmation ?? null,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
      iframeUrl,
    };
  }

  // ─── Eliminar Tarjeta ──────────────────────────────────────────────────────

  /**
   * Elimina una tarjeta catastrada de un usuario usando su alias_token.
   */
  async deleteCard(params: DeleteCardParams): Promise<DeleteCardResult> {
    const bancardResponse = await this.adapter.deleteCard(params);

    return {
      status: bancardResponse.status,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
    };
  }

  // ─── Factura Electrónica (Cancelación) ──────────────────────────────────────

  /**
   * Cancela una factura electrónica previamente generada.
   */
  async cancelBilling(params: CancelBillingParams): Promise<CancelBillingResult> {
    const bancardResponse = await this.adapter.cancelBilling(params);

    return {
      status: bancardResponse.status,
      messages: bancardResponse.messages ?? [],
      rawResponse: bancardResponse,
    };
  }

  // ─── Webhook de Confirmación ────────────────────────────────────────────────

  /**
   * Procesa la notificación de pago enviada por Bancard a la URL de confirmación.
   */
  processConfirmationWebhook(webhookData: BancardWebhookPayload): ProcessedConfirmation {
    const operation = webhookData.operation;

    if (!operation) {
      throw new BancardApiError('Webhook recibido sin datos de operación.', webhookData);
    }

    return {
      shopProcessId: operation.shop_process_id as number,
      ticketNumber: operation.ticket_number,
      authorizationNumber: operation.authorization_number,
      amount: operation.amount,
      currency: operation.currency,
      cardBrand: operation.card_brand,
      cardMasked: operation.card_masked_number,
      responseCode: operation.response_code,
      responseDescription: operation.response_description,
      extendedResponseDescription: operation.extended_response_description,
      status: operation.response_code === '00' ? 'approved' : 'rejected',
      rawOperation: operation,
    };
  }
}
