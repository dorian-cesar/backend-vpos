/**
 * BancardHttpAdapter.ts
 * Adaptador HTTP para la comunicación con la API de Bancard vPOS.
 *
 * Patrón: Adapter
 * Propósito: Traduce las llamadas de alto nivel del BancardService
 * a peticiones HTTP compatibles con la API de Bancard, desacoplando
 * el código de negocio de los detalles de la API externa.
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import * as https from 'https';
import bancardConfig from '../config/bancard.config.js';
import {
  generateSingleBuyToken,
  generateRollbackToken,
  generateGetConfirmationToken,
  generateChargeBackToken,
  generateCardsNewToken,
  generateListCardsToken,
  generateChargeToken,
  generateDeleteCardToken,
} from '../utils/tokenGenerator.js';
import { BancardStrategy } from '../strategies/BancardStrategy.js';
import type {
  BancardCurrency,
  BancardRawResponse,
  ChargeBackParams,
  GetConfirmationParams,
  RollbackParams,
  SingleBuyParams,
  CardsNewParams,
  ListCardsParams,
  ChargeParams,
  DeleteCardParams,
  IBancardAdapter,
} from '../types/bancard.types.js';

export class BancardHttpAdapter implements IBancardAdapter {
  private readonly strategy: BancardStrategy;
  private readonly httpClient: AxiosInstance;

  constructor(strategy: BancardStrategy) {
    this.strategy = strategy;

    this.httpClient = axios.create({
      timeout: bancardConfig.httpTimeout,
      headers: strategy.getHeaders(),
      // Evitar que Axios lance una excepción con códigos HTTP 4xx o 5xx,
      // para poder capturar los errores de negocio de Bancard en el body.
      validateStatus: (status) => status < 500,
      // En staging ignoramos errores SSL (certificados autofirmados de Bancard)
      ...(strategy.getEnvironmentName() === 'staging' && {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }),
    });

    this._setupInterceptors();
  }

  // ─── Interceptores axios ──────────────────────────────────────────────────

  private _setupInterceptors(): void {
    this.httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      console.log(`[BancardAdapter] → ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log(`[BancardAdapter] ← ${response.status} ${response.config.url}`);
        return response;
      },
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? 'sin respuesta';
          const url = error.config?.url ?? 'URL desconocida';
          console.error(
            `[BancardAdapter] ✗ Error ${status} en ${url}:`,
            error.response?.data ?? error.message,
          );
        }
        return Promise.reject(error);
      },
    );
  }

  // ─── single_buy ────────────────────────────────────────────────────────────

  /**
   * Inicia una transacción de compra simple en Bancard.
   * @returns Respuesta cruda de Bancard con `process_id`.
   */
  async singleBuy(params: SingleBuyParams): Promise<BancardRawResponse> {
    const {
      shopProcessId,
      amount,
      currency = bancardConfig.defaultCurrency,
      description,
      additionalData,
      returnUrl,
      cancelUrl,
    } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const formattedAmount = Number(amount).toFixed(2);
    const token = generateSingleBuyToken(privateKey, shopProcessId, formattedAmount, currency as BancardCurrency);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.singleBuy);

    const requestBody: Record<string, any> = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
        currency,
        amount: formattedAmount,
        additional_data: additionalData ?? '',
        description: description.substring(0, 50),
        return_url: returnUrl ?? bancardConfig.returnUrl,
        cancel_url: cancelUrl ?? bancardConfig.cancelUrl,
      },
    };

    if (bancardConfig.currentEnvironment.name === 'staging') {
      requestBody.test_client = true;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[BancardAdapter] ► single_buy REQUEST:')
    console.log('  URL Bancard:', url)
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ single_buy RESPONSE (HTTP', response.status, '):')
    console.log(JSON.stringify(response.data, null, 2))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return response.data;
  }

  // ─── single_buy_rollback ───────────────────────────────────────────────────

  /**
   * Revierte/cancela una transacción previamente iniciada.
   */
  async rollback(params: RollbackParams): Promise<BancardRawResponse> {
    const { shopProcessId } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const token = generateRollbackToken(privateKey, shopProcessId);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.rollback);

    const requestBody = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
      },
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► rollback REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ rollback RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── get_single_buy_confirmation ───────────────────────────────────────────

  /**
   * Consulta el estado de una transacción de compra simple.
   */
  async getConfirmation(params: GetConfirmationParams): Promise<BancardRawResponse> {
    const { shopProcessId } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const token = generateGetConfirmationToken(privateKey, shopProcessId);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.getConfirmation);

    const requestBody = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
      },
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[BancardAdapter] ► get_single_buy_confirmation REQUEST:')
    console.log('  URL Bancard:', url)
    console.log('  shop_process_id:', shopProcessId)
    console.log('  token (md5):', token)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ get_single_buy_confirmation RESPONSE (HTTP', response.status, '):')
    console.log(JSON.stringify(response.data, null, 2))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return response.data;
  }

  // ─── charge_back ──────────────────────────────────────────────────────────

  /**
   * Realiza un contracargo (devolución) de una transacción aprobada.
   */
  async chargeBack(params: ChargeBackParams): Promise<BancardRawResponse> {
    const { shopProcessId, amount, currency = bancardConfig.defaultCurrency } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const formattedAmount = Number(amount).toFixed(2);
    const token = generateChargeBackToken(privateKey, shopProcessId, formattedAmount, currency as BancardCurrency);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.chargeBack);

    const requestBody = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
        amount: formattedAmount,
        currency,
      },
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► charge_back REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ charge_back RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── cards/new ─────────────────────────────────────────────────────────────

  /**
   * Inicia el proceso de catastro de una nueva tarjeta.
   */
  async cardsNew(params: CardsNewParams): Promise<BancardRawResponse> {
    const { cardId, userId, userCellPhone, userMail, returnUrl, cancelUrl } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const token = generateCardsNewToken(privateKey, cardId, userId);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.cardsNew);

    const requestBody: Record<string, any> = {
      public_key: publicKey,
      operation: {
        token,
        card_id: cardId,
        user_id: userId,
        user_cell_phone: userCellPhone,
        user_mail: userMail,
        return_url: returnUrl ?? bancardConfig.returnUrl,
        cancel_url: cancelUrl ?? bancardConfig.cancelUrl,
      },
    };

    if (bancardConfig.currentEnvironment.name === 'staging') {
      requestBody.test_client = true;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► cards_new REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ cards_new RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── users/:userId/cards ───────────────────────────────────────────────────

  /**
   * Obtiene la lista de tarjetas catastradas de un usuario.
   */
  async listCards(params: ListCardsParams): Promise<BancardRawResponse> {
    const { userId } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const token = generateListCardsToken(privateKey, userId);

    // Endpoint en Bancard: /vpos/api/0.3/users/{userId}/cards
    const baseUrl = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.usersBase);
    const url = `${baseUrl}/${userId}/cards`;

    const requestBody: Record<string, any> = {
      public_key: publicKey,
      operation: {
        token,
      },
    };

    if (bancardConfig.currentEnvironment.name === 'staging') {
      requestBody.test_client = true;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► list_cards REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // List cards requires a POST request
    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ list_cards RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── charge ────────────────────────────────────────────────────────────

  /**
   * Procesa un pago directo usando una tarjeta catastrada (alias_token).
   * Utilizado para "Pagar con tarjeta guardada" sin re-ingresar datos.
   */
  async charge(params: ChargeParams): Promise<BancardRawResponse> {
    const {
      shopProcessId,
      amount,
      currency = bancardConfig.defaultCurrency,
      description,
      aliasToken,
      additionalData,
      numberOfPayments = 1,
    } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const formattedAmount = Number(amount).toFixed(2);
    const token = generateChargeToken(privateKey, shopProcessId, formattedAmount, currency, aliasToken);

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.charge);

    const requestBody: Record<string, any> = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
        amount: formattedAmount,
        number_of_payments: numberOfPayments,
        currency,
        additional_data: additionalData ?? '',
        description: description.substring(0, 50),
        alias_token: aliasToken,
      },
    };

    if (bancardConfig.currentEnvironment.name === 'staging') {
      requestBody.test_client = true;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► charge REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  shop_process_id:', shopProcessId);
    console.log('  alias_token:', aliasToken);
    console.log('  token (md5):', token);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);

    console.log('[BancardAdapter] ◄ charge RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── users/:userId/cards (DELETE) ──────────────────────────────────────────

  /**
   * Elimina una tarjeta catastrada de un usuario.
   */
  async deleteCard(params: DeleteCardParams): Promise<BancardRawResponse> {
    const { userId, aliasToken } = params;

    const privateKey = this.strategy.getPrivateKey();
    const publicKey = this.strategy.getPublicKey();
    const token = generateDeleteCardToken(privateKey, userId, aliasToken);

    const baseUrl = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.usersBase);
    const url = `${baseUrl}/${userId}/cards`;

    const requestBody: Record<string, any> = {
      public_key: publicKey,
      operation: {
        token,
        alias_token: aliasToken,
      },
    };

    if (bancardConfig.currentEnvironment.name === 'staging') {
      requestBody.test_client = true;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[BancardAdapter] ► delete_card REQUEST:');
    console.log('  URL Bancard:', url);
    console.log('  Payload crudo enviado a Bancard:', JSON.stringify(requestBody, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // La operación DELETE puede enviar body en axios utilizando la propiedad `data` de la configuración.
    const response = await this.httpClient.delete<BancardRawResponse>(url, {
      data: requestBody
    });

    console.log('[BancardAdapter] ◄ delete_card RESPONSE (HTTP', response.status, '):');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return response.data;
  }

  // ─── Helpers públicos ──────────────────────────────────────────────────────

  /** Retorna la URL del iframe de pago para el `process_id` dado. */
  getIframeUrl(processId: string): string {
    return this.strategy.getIframeUrl(processId);
  }

  /** Retorna la URL del SDK de Bancard. */
  getSdkUrl(): string {
    return this.strategy.getSdkUrl();
  }

  /** Retorna el nombre del entorno activo. */
  getEnvironment(): string {
    return this.strategy.getEnvironmentName();
  }
}
