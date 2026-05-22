/**
 * BancardMockAdapter.ts
 * Simulador (Mock) de la API de Bancard para entornos locales.
 *
 * Propósito: Permite desarrollar y probar el frontend sin depender de
 * claves reales de Bancard. Simula respuestas exitosas con delays artificiales.
 */

import crypto from 'crypto';
import type {
  BancardRawResponse,
  ChargeBackParams,
  GetConfirmationParams,
  RollbackParams,
  SingleBuyParams,
  IBancardAdapter,
} from '../types/bancard.types';
import bancardConfig from '../config/bancard.config';

export class BancardMockAdapter implements IBancardAdapter {
  // ─── Helpers privados ─────────────────────────────────────────────────────

  private _generateProcessId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private _delay(ms = 800): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Métodos de la interfaz ───────────────────────────────────────────────

  async singleBuy(params: SingleBuyParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 🚀 Simulando singleBuy para shopProcessId: ${params.shopProcessId}`);
    return {
      status: 'success',
      process_id: `mock_process_${this._generateProcessId()}`,
    };
  }

  async rollback(params: RollbackParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] ⏪ Simulando rollback para shopProcessId: ${params.shopProcessId}`);
    return {
      status: 'success',
      messages: [
        {
          key: 'RollbackSuccessful',
          level: 'info',
          dsc: 'Rollback correcto (MOCK).',
        },
      ],
    };
  }

  async getConfirmation(params: GetConfirmationParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(
      `[BancardMockAdapter] 🔍 Simulando getConfirmation para shopProcessId: ${params.shopProcessId}`,
    );
    return {
      status: 'success',
      confirmation: {
        shop_process_id: Number(params.shopProcessId),
        response_code: '00',
        response_description: 'Transacción aprobada (MOCK).',
        amount: '15000.00',
        currency: 'PYG',
        authorization_number: '123456',
        ticket_number: '123456789123456',
        card_brand: 'MasterCard',
        card_masked_number: '5418********0014',
      },
    };
  }

  async chargeBack(params: ChargeBackParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💸 Simulando chargeBack para shopProcessId: ${params.shopProcessId}`);
    return {
      status: 'success',
      messages: [
        {
          key: 'ChargeBackSuccessful',
          level: 'info',
          dsc: 'Contracargo exitoso (MOCK).',
        },
      ],
    };
  }

  getIframeUrl(processId: string): string {
    // Usamos la URL de staging para que apunte a un dominio válido (aunque fallará por el process_id inválido)
    // Opcionalmente podrías retornar una URL de localhost que levante un HTML simulado.
    return `${bancardConfig.environments.staging.baseUrl}/payment/card/new_hp?process_id=${processId}`;
  }

  getEnvironment(): string {
    return 'mock';
  }
}
