/**
 * pagoSimple.response.dto.ts
 * DTOs de salida (Response) para el Gateway Unificado /api/pagosimple.
 *
 * Define exactamente qué devuelve el backend al frontend.
 * No deben contener lógica de negocio — solo tipado y contratos de salida.
 */

import type { BancardMessage, BancardConfirmation, BancardRawResponse } from '../../types/bancard.types.js';

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

// ─── Datos del `data` por acción ─────────────────────────────────────────────

/** data de `single-buy` exitoso */
export interface SingleBuyData {
  processId: string;
  shopProcessId: number;
  iframeUrl: string;
  sdkUrl: string;
  status: string;
  environment: string;
  rawResponse: BancardRawResponse;
}

/** data de `rollback` */
export interface RollbackData {
  processId: string;
  shopProcessId: number;
  processed: boolean;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `confirmation` */
export interface ConfirmationData {
  processId: string;
  shopProcessId: number;
  status: string;
  confirmation: BancardConfirmation | null;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `charge-back` */
export interface ChargeBackData {
  processId: string;
  shopProcessId: number;
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `cards-new` */
export interface CardsNewData {
  processId: string;
  status: string;
  environment: string;
  rawResponse: BancardRawResponse;
}

/** data de `list-cards` */
export interface ListCardsData {
  userId: number;
  cards: unknown[];
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `charge` (pago con alias) */
export interface ChargeData {
  shopProcessId: number;
  status: string;
  confirmation: BancardConfirmation | null | undefined;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
  iframeUrl?: string;
}

/** data de `delete-card` */
export interface DeleteCardData {
  userId: number;
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `cancel-billing` */
export interface CancelBillingData {
  processId: string;
  shopProcessId: number;
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `preauth-confirm` */
export interface PreauthConfirmData {
  processId: string;
  shopProcessId: number;
  status: string;
  confirmation: BancardConfirmation | null;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

/** data de `client-info` */
export interface ClientInfoData {
  status: string;
  client?: { name: string; email: string } | null;
  messages?: BancardMessage[];
  rawResponse: BancardRawResponse;
}

// ─── Tipos de respuesta completos por acción ─────────────────────────────────

export type SingleBuyResponseDto    = ApiSuccessDto<SingleBuyData>;
export type RollbackResponseDto     = ApiSuccessDto<RollbackData>;
export type ConfirmationResponseDto = ApiSuccessDto<ConfirmationData>;
export type ChargeBackResponseDto   = ApiSuccessDto<ChargeBackData>;
export type CardsNewResponseDto     = ApiSuccessDto<CardsNewData>;
export type ListCardsResponseDto    = ApiSuccessDto<ListCardsData>;
export type ChargeResponseDto       = ApiSuccessDto<ChargeData>;
export type DeleteCardResponseDto   = ApiSuccessDto<DeleteCardData>;
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
