/**
 * pagoSimple.response.dto.ts
 * DTOs de salida (Response) para el Gateway Unificado /api/pagosimple.
 *
 * Reglas de diseño:
 * - Solo se exponen los datos que el frontend necesita consumir.
 * - NO se incluye `rawResponse` (respuesta cruda interna de Bancard).
 * - NO se exponen tokens internos (private_key, token MD5, public_key).
 * - Los datos sensibles del cliente (email completo, RUC) son opcionales/omitibles.
 */

import type { BancardMessage } from '../../types/bancard.types.js';

// ─── Envolturas genéricas de respuesta ────────────────────────────────────────

/** Respuesta genérica de éxito. El campo `data` varía por acción. */
export interface ApiSuccessDto<T = unknown> {
  status: 'success';
  action?: string;
  message?: string;
  data: T;
}

/** Respuesta genérica de error. */
export interface ApiErrorDto {
  status: 'error';
  action?: string;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  bancardMessages?: BancardMessage[];
  detail?: string;
}

// ─── Sub-tipos reutilizables ──────────────────────────────────────────────────

/**
 * Resumen de la confirmación de un pago — solo los campos útiles al frontend.
 * NO incluye datos internos como tokens ni el objeto crudo de Bancard.
 */
export interface PaymentConfirmationSummary {
  /** Código de respuesta de la red (ej: "00" = aprobado) */
  responseCode?: string;
  /** Descripción legible del resultado */
  responseDescription?: string;
  /** Número de ticket de la transacción */
  ticketNumber?: string;
  /** Número de autorización del banco emisor */
  authorizationNumber?: string;
  /** Monto cobrado */
  amount?: string;
  /** Moneda del cobro */
  currency?: string;
  /** Marca de tarjeta usada (VISA, Mastercard, etc.) */
  cardBrand?: string;
  /** Número de tarjeta enmascarado (ej: "411111XXXXXX1111") */
  cardMaskedNumber?: string;
}

// ─── Datos del `data` por acción ─────────────────────────────────────────────

/** data de `single-buy` exitoso — lo mínimo para que el frontend abra el iframe */
export interface SingleBuyData {
  /** process_id de Bancard — debe guardarse en el frontend para usarlo en rollback/confirmation */
  processId: string;
  /** URL del iframe de pago para embeberse en el frontend */
  iframeUrl: string;
  /** URL del script SDK de Bancard para cargar el iframe */
  sdkUrl: string;
  /** Entorno activo (staging | production) */
  environment: string;
}

/** data de `rollback` */
export interface RollbackData {
  /** process_id original de la transacción revertida */
  processId: string;
  /** Si el rollback fue aceptado por Bancard */
  processed: boolean;
  /** Mensajes informativos de Bancard */
  messages: BancardMessage[];
}

/** data de `confirmation` */
export interface ConfirmationData {
  /** process_id de la transacción consultada */
  processId: string;
  /** Estado del pago según Bancard (success | error) */
  status: string;
  /** Detalles de la confirmación si el pago fue aprobado */
  confirmation: PaymentConfirmationSummary | null;
  /** Mensajes adicionales de Bancard */
  messages: BancardMessage[];
}

/** data de `charge-back` */
export interface ChargeBackData {
  /** process_id de la transacción que se devolvió */
  processId: string;
  /** Estado de la operación */
  status: string;
  /** Mensajes de Bancard */
  messages: BancardMessage[];
}

/** data de `cards-new` */
export interface CardsNewData {
  /** process_id del proceso de catastro */
  processId: string;
  /** URL del iframe de catastro para embeberse en el frontend */
  iframeUrl: string;
  /** URL del script SDK de Bancard */
  sdkUrl: string;
  /** Entorno activo */
  environment: string;
}

/** data de `list-cards` */
export interface ListCardsData {
  /** ID del usuario propietario de las tarjetas */
  userId: number;
  /** Lista de tarjetas catastradas */
  cards: unknown[];
  /** Mensajes de Bancard */
  messages: BancardMessage[];
}

/** data de `charge` (pago con alias) */
export interface ChargeData {
  /** Estado del cobro */
  status: string;
  /** Detalles de la confirmación (si la tarjeta fue aprobada de inmediato) */
  confirmation: PaymentConfirmationSummary | null | undefined;
  /** Mensajes de Bancard */
  messages: BancardMessage[];
  /** URL del iframe (solo para débito que requiere confirmación con PIN) */
  iframeUrl?: string;
}

/** data de `delete-card` */
export interface DeleteCardData {
  /** Estado de la operación */
  status: string;
  /** Mensajes de Bancard */
  messages: BancardMessage[];
}

/** data de `cancel-billing` */
export interface CancelBillingData {
  /** process_id de la transacción original */
  processId: string;
  /** Estado de la operación */
  status: string;
  /** Mensajes de Bancard */
  messages: BancardMessage[];
}

/** data de `preauth-confirm` */
export interface PreauthConfirmData {
  /** process_id de la preautorización confirmada */
  processId: string;
  /** Detalles del cobro final */
  confirmation: PaymentConfirmationSummary | null;
  /** Mensajes de Bancard */
  messages: BancardMessage[];
}

/** data de `client-info` */
export interface ClientInfoData {
  /** Razón Social del cliente según TAXIT */
  clientName?: string;
  /** Correo del cliente registrado en TAXIT */
  clientEmail?: string;
  /** Mensajes de Bancard */
  messages?: BancardMessage[];
}

// ─── Tipos de respuesta completos por acción ─────────────────────────────────

export type SingleBuyResponseDto       = ApiSuccessDto<SingleBuyData>;
export type RollbackResponseDto        = ApiSuccessDto<RollbackData>;
export type ConfirmationResponseDto    = ApiSuccessDto<ConfirmationData>;
export type ChargeBackResponseDto      = ApiSuccessDto<ChargeBackData>;
export type CardsNewResponseDto        = ApiSuccessDto<CardsNewData>;
export type ListCardsResponseDto       = ApiSuccessDto<ListCardsData>;
export type ChargeResponseDto          = ApiSuccessDto<ChargeData>;
export type DeleteCardResponseDto      = ApiSuccessDto<DeleteCardData>;
export type CancelBillingResponseDto   = ApiSuccessDto<CancelBillingData>;
export type PreauthConfirmResponseDto  = ApiSuccessDto<PreauthConfirmData>;
export type ClientInfoResponseDto      = ApiSuccessDto<ClientInfoData>;

/** Health check response */
export interface HealthCheckResponseDto {
  status: 'ok' | 'error';
  service: string;
  environment: string;
  timestamp: string;
}
