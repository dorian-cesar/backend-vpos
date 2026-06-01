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
} from '../utils/tokenGenerator.js';
import { BancardStrategy } from '../strategies/BancardStrategy.js';
import type {
  BancardCurrency,
  BancardRawResponse,
  ChargeBackParams,
  GetConfirmationParams,
  RollbackParams,
  SingleBuyParams,
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

    const requestBody = {
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

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);
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

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.rollback, {
      process_id: shopProcessId,
    });

    const requestBody = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
      },
    };

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);
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

    const url = this.strategy.buildEndpointUrl(bancardConfig.apiPaths.getConfirmation, {
      process_id: shopProcessId,
    });

    const requestBody = {
      public_key: publicKey,
      operation: {
        token,
        shop_process_id: shopProcessId,
      },
    };

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);
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

    const response = await this.httpClient.post<BancardRawResponse>(url, requestBody);
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
