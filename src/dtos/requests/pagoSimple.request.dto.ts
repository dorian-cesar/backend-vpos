/**
 * pagoSimple.request.dto.ts
 * DTOs de entrada (Request) para el Gateway Unificado /api/pagosimple.
 *
 * Define exactamente qué espera el backend del frontend.
 * No deben contener lógica de negocio — solo tipado y contratos de entrada.
 */

import type { BancardBilling, BancardCurrency } from '../../types/bancard.types.js';

// ─── Discriminador de acción ──────────────────────────────────────────────────

/**
 * Acciones disponibles en el Gateway Unificado.
 * El frontend envía este campo para indicar qué operación ejecutar.
 */
export type PagoSimpleAction =
  | 'single-buy'      // Iniciar una nueva compra (flujo principal)
  | 'rollback'        // Revertir una transacción pendiente/no confirmada
  | 'confirmation'    // Consultar el estado de una transacción
  | 'charge-back'     // Devolución de un pago ya aprobado
  | 'cards-new'       // Iniciar proceso de catastro de nueva tarjeta
  | 'list-cards'      // Listar tarjetas catastradas de un usuario
  | 'charge'          // Pago con tarjeta guardada (alias_token)
  | 'delete-card'     // Eliminar una tarjeta catastrada
  | 'cancel-billing'  // Cancelar factura electrónica
  | 'preauth-confirm' // Confirmar preautorización
  | 'client-info';    // Consultar datos de cliente por RUC

// ─── DTO Base (campos comunes a todas las acciones) ───────────────────────────

interface PagoSimpleBaseDto {
  action: PagoSimpleAction;
  /** ID externo de referencia para auditoría (opcional) */
  id?: string;
  /** Nombre del servicio/app origen (opcional, para auditoría) */
  servicio?: string;
  /** Canal de venta: totem, web, puntodeventa (opcional, para auditoría) */
  canal?: string;
}

// ─── DTOs por acción ──────────────────────────────────────────────────────────

export interface SingleBuyDto extends PagoSimpleBaseDto {
  action: 'single-buy';
  /** Monto del pago. Requerido. */
  amount: number;
  /** Moneda (default: PYG) */
  currency?: BancardCurrency;
  /** Descripción del pago (máx. 50 caracteres). Requerido. */
  description: string;
  /** Monto del IVA. Opcional. */
  ivaAmount?: number;
  /** Datos de facturación electrónica. Opcional. */
  billing?: BancardBilling;
  /** Datos adicionales. Opcional. */
  additionalData?: string;
  /** Indica si la transacción es una preautorización (no debita inmediatamente). Opcional. */
  preauthorization?: boolean;
  /** Indica si la transacción se realizará vía Zimple. Opcional. */
  zimple?: boolean;
  /** URL de retorno del iframe de Bancard. Opcional — si no se envía, usa el valor de .env. */
  returnUrl?: string;
  /** URL de cancelación del iframe de Bancard. Opcional — si no se envía, usa el valor de .env. */
  cancelUrl?: string;
}

export interface RollbackDto extends PagoSimpleBaseDto {
  action: 'rollback';
  /** process_id de Bancard retornado en single-buy. Requerido. */
  processId: string;
}

export interface ConfirmationDto extends PagoSimpleBaseDto {
  action: 'confirmation';
  /** process_id de Bancard retornado en single-buy. Requerido. */
  processId: string;
}

export interface ChargeBackDto extends PagoSimpleBaseDto {
  action: 'charge-back';
  /** process_id de Bancard retornado en single-buy. Requerido. */
  processId: string;
  /** Monto a devolver. Requerido. */
  amount: number;
  /** Moneda (default: PYG). Opcional. */
  currency?: BancardCurrency;
}

export interface CardsNewDto extends PagoSimpleBaseDto {
  action: 'cards-new';
  cardId: number;
  userId: number;
  userCellPhone: string;
  userMail: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface ListCardsDto extends PagoSimpleBaseDto {
  action: 'list-cards';
  userId: number;
}

export interface ChargeDto extends PagoSimpleBaseDto {
  action: 'charge';
  amount: number;
  currency?: BancardCurrency;
  description: string;
  aliasToken: string;
  additionalData?: string;
  numberOfPayments?: number;
}

export interface DeleteCardDto extends PagoSimpleBaseDto {
  action: 'delete-card';
  userId: number;
  aliasToken: string;
}

export interface CancelBillingDto extends PagoSimpleBaseDto {
  action: 'cancel-billing';
  /** process_id de Bancard de la transacción. Requerido. */
  processId: string;
}

export interface PreauthConfirmDto extends PagoSimpleBaseDto {
  action: 'preauth-confirm';
  /** process_id de Bancard de la preautorización. Requerido. */
  processId: string;
  /** Monto de confirmación. Opcional (puede diferir de la preautorización original). */
  amount?: number;
  /** Datos de facturación electrónica. Opcional. */
  billing?: BancardBilling;
}

export interface ClientInfoDto extends PagoSimpleBaseDto {
  action: 'client-info';
  /** RUC del cliente a consultar. Requerido. */
  clientRuc: string;
}

// ─── Tipo discriminado unificado del Gateway ──────────────────────────────────

/**
 * Tipo unión discriminado que representa el body completo del Gateway /api/pagosimple.
 * TypeScript puede narrowear automáticamente según `action`.
 */
export type PagoSimpleRequestDto =
  | SingleBuyDto
  | RollbackDto
  | ConfirmationDto
  | ChargeBackDto
  | CardsNewDto
  | ListCardsDto
  | ChargeDto
  | DeleteCardDto
  | CancelBillingDto
  | PreauthConfirmDto
  | ClientInfoDto;

/**
 * Versión permisiva del DTO para uso como tipo del body de Express (antes de que el
 * switch discrimine la acción). Todos los campos son opcionales excepto `action`.
 */
export interface PagoSimpleLooseDto {
  action: PagoSimpleAction;
  id?: string;
  servicio?: string;
  canal?: string;
  processId?: string;
  shopProcessId?: number | string;
  amount?: number;
  currency?: BancardCurrency;
  description?: string;
  billing?: BancardBilling;
  additionalData?: string;
  preauthorization?: boolean;
  zimple?: boolean;
  returnUrl?: string;
  cancelUrl?: string;
  clientRuc?: string;
  cardId?: number;
  userId?: number;
  userCellPhone?: string;
  userMail?: string;
  aliasToken?: string;
  numberOfPayments?: number;
}

// ─── DTOs de requests para los endpoints legacy de /api/bancard/* ─────────────

export interface LegacyRollbackRequestDto {
  shopProcessId: number;
}

export interface LegacyChargeBackRequestDto {
  shopProcessId: number;
  amount: number;
  currency?: BancardCurrency;
}
