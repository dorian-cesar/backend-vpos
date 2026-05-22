/**
 * bancard.config.ts
 * Configuración centralizada para la integración con Bancard vPOS.
 */

import type { BancardCurrency, BancardEnvironment, BancardEnvironmentName } from '../types/bancard.types';

// ─── Tipo interno del config (con getters) ────────────────────────────────

interface BancardConfigInternal {
  publicKey: string;
  privateKey: string;
  environments: {
    staging: BancardEnvironment;
    production: BancardEnvironment;
  };
  readonly currentEnvironment: BancardEnvironment;
  apiPaths: {
    singleBuy: string;
    rollback: string;
    getConfirmation: string;
    chargeBack: string;
  };
  readonly iframeUrl: string;
  httpTimeout: number;
  defaultCurrency: BancardCurrency;
  appUrl: string;
  returnUrl: string;
  cancelUrl: string;
}

const config: BancardConfigInternal = {
  // ─── Credenciales ─────────────────────────────────────────────────────────
  publicKey: process.env.BANCARD_PUBLIC_KEY ?? '',
  privateKey: process.env.BANCARD_PRIVATE_KEY ?? '',

  // ─── Entornos ─────────────────────────────────────────────────────────────
  environments: {
    staging: {
      baseUrl: process.env.BANCARD_STAGING_URL ?? 'https://vpos.infonet.com.py:8888',
      name: 'staging' as BancardEnvironmentName,
    },
    production: {
      baseUrl: process.env.BANCARD_PRODUCTION_URL ?? 'https://vpos.infonet.com.py',
      name: 'production' as BancardEnvironmentName,
    },
  },

  // ─── Entorno activo (getter) ──────────────────────────────────────────────
  get currentEnvironment(): BancardEnvironment {
    const env: BancardEnvironmentName =
      process.env.NODE_ENV === 'production' ? 'production' : 'staging';
    return this.environments[env];
  },

  // ─── Rutas de la API de Bancard ───────────────────────────────────────────
  apiPaths: {
    singleBuy: '/vpos/api/0.3/single_buy',
    rollback: '/vpos/api/0.3/single_buy/{process_id}/rollback',
    getConfirmation: '/vpos/api/0.3/single_buy/{process_id}',
    chargeBack: '/vpos/api/0.3/single_buy/charge_back',
  },

  // ─── URL del iframe (getter) ──────────────────────────────────────────────
  get iframeUrl(): string {
    return `${this.currentEnvironment.baseUrl}/payment/card/new_hp?process_id={process_id}`;
  },

  // ─── HTTP ─────────────────────────────────────────────────────────────────
  httpTimeout: 30_000,

  // ─── Moneda por defecto ───────────────────────────────────────────────────
  defaultCurrency: (process.env.DEFAULT_CURRENCY as BancardCurrency | undefined) ?? 'PYG',

  // ─── URLs de la app ───────────────────────────────────────────────────────
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  returnUrl: process.env.RETURN_URL ?? 'http://localhost:3000/payment/success',
  cancelUrl: process.env.CANCEL_URL ?? 'http://localhost:3000/payment/cancel',
};

export default config;
export type { BancardConfigInternal as BancardConfig };
