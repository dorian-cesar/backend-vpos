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
  ListCardsParams,
  ChargeParams,
  DeleteCardParams,
  IBancardAdapter,
} from '../types/bancard.types.js';
import bancardConfig from '../config/bancard.config.js';

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

  async cardsNew(params: any): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💳 Simulando cardsNew para cardId: ${params.cardId}`);
    return {
      status: 'success',
      process_id: `mock_cards_new_${this._generateProcessId()}`,
    };
  }

  async listCards(params: ListCardsParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💳 Simulando listCards para userId: ${params.userId}`);
    return {
      status: 'success',
      cards: [
        {
          card_id: 123,
          card_masked_number: '4111********1111',
          expiration_date: '12/2030',
          card_brand: 'Visa',
          card_type: 'Credit',
          alias_token: 'mock-alias-token-visa-4111'
        },
        {
          card_id: 456,
          card_masked_number: '5418********0014',
          expiration_date: '08/2028',
          card_brand: 'MasterCard',
          card_type: 'Debit',
          alias_token: 'mock-alias-token-mc-5418'
        }
      ]
    } as unknown as BancardRawResponse;
  }

  async charge(params: ChargeParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💳 Simulando charge con alias_token: ${params.aliasToken} para shopProcessId: ${params.shopProcessId}`);
    return {
      status: 'success',
      messages: [
        {
          key: 'ChargeSuccessful',
          level: 'info',
          dsc: 'Pago con tarjeta guardada exitoso (MOCK).',
        },
      ],
      confirmation: {
        shop_process_id: Number(params.shopProcessId),
        response_code: '00',
        response_description: 'Aprobado (MOCK)',
        amount: Number(params.amount).toFixed(2),
        currency: params.currency ?? 'PYG',
        authorization_number: 'MOCK-AUTH-999',
        ticket_number: `MOCK-${Date.now()}`,
        card_brand: 'Visa',
        card_masked_number: '4111********1111',
      },
    } as unknown as BancardRawResponse;
  }

  async deleteCard(params: DeleteCardParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💳 Simulando deleteCard con alias_token: ${params.aliasToken} para userId: ${params.userId}`);
    return {
      status: 'success',
      messages: [
        {
          key: 'DeleteCardSuccessful',
          level: 'info',
          dsc: 'Tarjeta eliminada exitosamente (MOCK).',
        },
      ],
    } as unknown as BancardRawResponse;
  }

  getIframeUrl(processId: string): string {
    // Usamos la URL de staging para que apunte a un dominio válido (aunque fallará por el process_id inválido)
    // Opcionalmente podrías retornar una URL de localhost que levante un HTML simulado.
    return `${bancardConfig.environments.staging.baseUrl}/payment/card/new_hp?process_id=${processId}`;
  }

  getSdkUrl(): string {
    return `${bancardConfig.environments.staging.baseUrl}/checkout/javascript/dist/bancard-checkout-4.0.0.js`;
  }

  getEnvironment(): string {
    return 'mock';
  }
}
