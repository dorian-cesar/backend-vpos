/**
 * BancardStagingStrategy.ts
 * Estrategia concreta para el entorno de STAGING (pruebas) de Bancard vPOS.
 *
 * Patrón: Strategy (Concrete Strategy)
 * URL staging: https://vpos.infonet.com.py:8888
 */

import { BancardStrategy } from './BancardStrategy';
import type { BancardConfig } from '../config/bancard.config';
import type { BancardEnvironmentName } from '../types/bancard.types';

export class BancardStagingStrategy extends BancardStrategy {
  private readonly _baseUrl: string;
  private readonly _name: BancardEnvironmentName = 'staging';

  constructor(config: BancardConfig) {
    super(config);
    this._baseUrl = config.environments.staging.baseUrl;
  }

  getBaseUrl(): string {
    return this._baseUrl;
  }

  getEnvironmentName(): BancardEnvironmentName {
    return this._name;
  }

  /**
   * En staging, permite credenciales vacías para facilitar el desarrollo
   * sin claves reales de Bancard.
   */
  getPublicKey(): string {
    return this.config.publicKey || 'test_public_key';
  }

  getPrivateKey(): string {
    return this.config.privateKey || 'test_private_key';
  }
}
