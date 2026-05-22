/**
 * BancardProductionStrategy.ts
 * Estrategia concreta para el entorno de PRODUCCIÓN de Bancard vPOS.
 *
 * Patrón: Strategy (Concrete Strategy)
 * URL producción: https://vpos.infonet.com.py
 *
 * ⚠️  IMPORTANTE: Las variables BANCARD_PUBLIC_KEY y BANCARD_PRIVATE_KEY
 *    deben estar correctamente configuradas antes de usar esta estrategia.
 */

import { BancardStrategy } from './BancardStrategy';
import type { BancardConfig } from '../config/bancard.config';
import type { BancardEnvironmentName } from '../types/bancard.types';

export class BancardProductionStrategy extends BancardStrategy {
  private readonly _baseUrl: string;
  private readonly _name: BancardEnvironmentName = 'production';

  constructor(config: BancardConfig) {
    super(config);
    this._baseUrl = config.environments.production.baseUrl;
  }

  getBaseUrl(): string {
    return this._baseUrl;
  }

  getEnvironmentName(): BancardEnvironmentName {
    return this._name;
  }

  /**
   * En producción las claves son obligatorias.
   * Lanza un error en tiempo de ejecución si no están configuradas.
   */
  getPublicKey(): string {
    if (!this.config.publicKey) {
      throw new Error(
        '[BancardProductionStrategy] La variable BANCARD_PUBLIC_KEY no está configurada.',
      );
    }
    return this.config.publicKey;
  }

  getPrivateKey(): string {
    if (!this.config.privateKey) {
      throw new Error(
        '[BancardProductionStrategy] La variable BANCARD_PRIVATE_KEY no está configurada.',
      );
    }
    return this.config.privateKey;
  }
}
