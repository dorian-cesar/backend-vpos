/**
 * bancard.config.ts
 * Configuración centralizada para la integración con Bancard vPOS.
 */

import type { BancardCurrency, BancardEnvironment, BancardEnvironmentName } from '../types/bancard.types.js';

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
    cardsNew: string;
    usersBase: string;
    charge: string;
    cancelBilling: string;
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
      baseUrl: process.env.BANCARD_BASE_URL_STAGING ?? process.env.BANCARD_STAGING_URL ?? 'https://vpos.infonet.com.py:8888',
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
    rollback: '/vpos/api/0.3/single_buy/rollback',
    getConfirmation: '/vpos/api/0.3/single_buy/confirmations',
    chargeBack: '/vpos/api/0.3/single_buy/charge_back',
    cardsNew: '/vpos/api/0.3/cards/new',
    usersBase: '/vpos/api/0.3/users',
    charge: '/vpos/api/0.3/charge',
    cancelBilling: '/vpos/api/0.3/billing/cancel',
  },

  // ─── URL del iframe (getter) ──────────────────────────────────────────────
  get iframeUrl(): string {
    return `${this.currentEnvironment.baseUrl}/payment/card/new_hp?process_id={process_id}`;
  },

  // ─── HTTP ─────────────────────────────────────────────────────────────────
  httpTimeout: 30_000,

  // ─── Moneda por defecto ───────────────────────────────────────────────────
  defaultCurrency: (process.env.DEFAULT_CURRENCY as BancardCurrency | undefined) ?? 'PYG',

  // ─── URLs de la app (getters para soportar paths relativos) ───────────────
  get appUrl(): string {
    return process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  },
  get returnUrl(): string {
    const url = process.env.RETURN_URL ?? '/confirm_payment';
    return url.startsWith('http') ? url : `${this.appUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  },
  get cancelUrl(): string {
    const url = process.env.CANCEL_URL ?? '/api/bancard/cancel';
    return url.startsWith('http') ? url : `${this.appUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  },
};

export default config;
export type { BancardConfigInternal as BancardConfig };
