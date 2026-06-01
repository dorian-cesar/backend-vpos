/**
 * BancardStrategy.ts
 * Clase abstracta base del patrón Strategy para la integración con Bancard vPOS.
 *
 * Patrón: Strategy
 * Propósito: Desacopla el comportamiento de selección de entorno
 * (staging vs producción) del código de negocio en BancardService.
 */

import type { BancardConfig } from '../config/bancard.config.js';
import type { BancardEnvironmentName } from '../types/bancard.types.js';

export abstract class BancardStrategy {
  protected readonly config: BancardConfig;

  constructor(config: BancardConfig) {
    this.config = config;
  }

  /** Retorna la URL base de la API de Bancard para este entorno. */
  abstract getBaseUrl(): string;



  /** Retorna el nombre del entorno activo: 'staging' | 'production'. */
  abstract getEnvironmentName(): BancardEnvironmentName;

  /** Retorna la clave pública del comercio. */
  abstract getPublicKey(): string;

  /** Retorna la clave privada del comercio (solo para generación de tokens interna). */
  abstract getPrivateKey(): string;

  /**
   * Construye la URL completa para un endpoint dado, reemplazando
   * los placeholders `{key}` con los valores del mapa `params`.
   *
   * @param path   - Path relativo (ej: '/vpos/api/0.3/single_buy/{process_id}/rollback')
   * @param params - Mapa de placeholders a reemplazar
   */
  buildEndpointUrl(path: string, params: Record<string, string | number> = {}): string {
    let url = `${this.getBaseUrl()}${path}`;
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, String(value));
    });
    return url;
  }

  /** Retorna los headers HTTP comunes para todas las peticiones a Bancard. */
  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Retorna la URL del iframe de pago de Bancard para el `process_id` dado.
   * @param processId - process_id retornado por la operación single_buy
   */
  getIframeUrl(processId: string): string {
    return `${this.getBaseUrl()}/payment/card/new_hp?process_id=${processId}`;
  }

  /**
   * Retorna la URL del SDK Javascript de Bancard para el frontend.
   */
  getSdkUrl(): string {
    return `${this.getBaseUrl()}/checkout/javascript/dist/bancard-checkout-4.0.0.js`;
  }
}
