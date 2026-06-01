/**
 * bancard.types.ts
 * Tipos e interfaces para la integración con Bancard vPOS (Compra Simple v1.22).
 * Fuente: eCommerce_bancard_compra_simple_version_1.22.pdf
 */

// ─── Monedas soportadas ────────────────────────────────────────────────────

export type BancardCurrency = 'PYG' | 'USD';

// ─── Entornos ─────────────────────────────────────────────────────────────

export type BancardEnvironmentName = 'staging' | 'production';

export interface BancardEnvironment {
  baseUrl: string;
  name: BancardEnvironmentName;
}


// ─── Parámetros de operaciones ────────────────────────────────────────────

export interface SingleBuyParams {
  shopProcessId: number | string;
  amount: number | string;
  currency?: BancardCurrency;
  description: string;
  additionalData?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface RollbackParams {
  shopProcessId: number | string;
}

export interface GetConfirmationParams {
  shopProcessId: number | string;
}

export interface ChargeBackParams {
  shopProcessId: number | string;
  amount: number | string;
  currency?: BancardCurrency;
}

// ─── Respuestas crudas de la API de Bancard ───────────────────────────────

export interface BancardRawResponse {
  status: string;
  process_id?: string;
  messages?: BancardMessage[];
  confirmation?: BancardConfirmation;
  [key: string]: unknown;
}

export interface BancardMessage {
  level: string;
  key: string;
  dsc: string;
}

export interface BancardConfirmation {
  shop_process_id: number;
  ticket_number?: string;
  authorization_number?: string;
  amount?: string;
  currency?: string;
  card_brand?: string;
  card_masked_number?: string;
  response_code?: string;
  response_description?: string;
  extended_response_description?: string;
  [key: string]: unknown;
}

// ─── Interfaces de Adaptadores ──────────────────────────────────────────────

export interface IBancardAdapter {
  singleBuy(params: SingleBuyParams): Promise<BancardRawResponse>;
  rollback(params: RollbackParams): Promise<BancardRawResponse>;
  getConfirmation(params: GetConfirmationParams): Promise<BancardRawResponse>;
  chargeBack(params: ChargeBackParams): Promise<BancardRawResponse>;
  getIframeUrl(processId: string): string;
  getSdkUrl(): string;
  getEnvironment(): string;
}

// ─── Respuestas del servicio (alto nivel) ─────────────────────────────────

export interface SingleBuyResult {
  processId: string;
  iframeUrl: string;
  sdkUrl: string;
  status: string;
  environment: BancardEnvironmentName;
  rawResponse: BancardRawResponse;
}

export interface RollbackResult {
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

export interface ConfirmationResult {
  status: string;
  confirmation: BancardConfirmation | null;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

export interface ChargeBackResult {
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

// ─── Webhook de confirmación de Bancard ──────────────────────────────────

export interface BancardWebhookPayload {
  operation?: BancardConfirmation;
  [key: string]: unknown;
}

export interface ProcessedConfirmation {
  shopProcessId: number;
  ticketNumber?: string;
  authorizationNumber?: string;
  amount?: string;
  currency?: string;
  cardBrand?: string;
  cardMasked?: string;
  responseCode?: string;
  responseDescription?: string;
  extendedResponseDescription?: string;
  status: 'approved' | 'rejected';
  rawOperation: BancardConfirmation;
}

// ─── Requests HTTP ────────────────────────────────────────────────────────

export interface SingleBuyRequest {
  shopProcessId: number;
  amount: number;
  currency?: BancardCurrency;
  description: string;
  additionalData?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PagoSimpleRequest extends SingleBuyRequest {
  servicio?: string;
  canal?: string;
  id?: string;
}

export interface RollbackRequest {
  shopProcessId: number;
}

export interface ChargeBackRequest {
  shopProcessId: number;
  amount: number;
  currency?: BancardCurrency;
}

// ─── Respuestas HTTP de la API propia ─────────────────────────────────────

export interface ApiSuccessResponse<T> {
  status: 'success';
  message?: string;
  data: T;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
  errors?: Array<{ field: string; message: string }>;
  bancardMessages?: BancardMessage[];
  detail?: string;
}
