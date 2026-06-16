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
  CardsNewParams,
  ChargeBackParams,
  GetConfirmationParams,
  RollbackParams,
  SingleBuyParams,
  ListCardsParams,
  ChargeParams,
  DeleteCardParams,
  CancelBillingParams,
  PreauthConfirmParams,
  ClientInfoParams,
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

  async cardsNew(params: CardsNewParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 💳 Simulando cardsNew para cardId: ${params.cardId} | returnUrl: ${params.returnUrl ?? '(default)'} | cancelUrl: ${params.cancelUrl ?? '(default)'}`);
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

  async cancelBilling(params: CancelBillingParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 📄 Simulando cancelBilling para shopProcessId: ${params.shopProcessId} y clientRuc: ${params.clientRuc}`);
    return {
      status: 'success',
      messages: [
        {
          key: 'CancelInvoiceSuccessful',
          level: 'info',
          dsc: 'Cancelación correcta de factura electrónica. (MOCK)',
        },
      ],
    } as unknown as BancardRawResponse;
  }

  async getClientInfo(params: ClientInfoParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] 🧑 Simulando getClientInfo para RUC: ${params.clientRuc}`);
    return {
      status: 'success',
      client: {
        name: 'Cliente Mock (MOCK)',
        email: 'cliente@mock.com',
      },
    };
  }

  async preauthorizationConfirm(params: PreauthConfirmParams): Promise<BancardRawResponse> {
    await this._delay();
    console.log(`[BancardMockAdapter] ✅ Simulando preauthorizationConfirm para shopProcessId: ${params.shopProcessId}`);
    return {
      status: 'success',
      confirmation: {
        shop_process_id: Number(params.shopProcessId),
        response_code: '00',
        response_description: 'Transacción aprobada (MOCK).',
        amount: params.amount ? params.amount.toString() : '15000.00',
        currency: 'PYG',
        authorization_number: '123456',
        ticket_number: '123456789123456',
        card_brand: 'MasterCard',
        card_masked_number: '5418********0014',
      },
    };
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  getIframeUrl(processId: string, operation: 'single_buy' | 'new_card' = 'single_buy'): string {
    const path = operation === 'new_card' ? '/payment/card/new_hp' : '/payment/single_buy';
    return `${bancardConfig.environments.staging.baseUrl}${path}?process_id=${processId}&mock=true`;
  }

  getSdkUrl(): string {
    return 'https://vpos.infonet.com.py/payment/vpos/vpos.js'; // URL real para que el script no falle
  }

  getEnvironment(): string {
    return 'mock';
  }
}
