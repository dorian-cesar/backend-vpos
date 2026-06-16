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

export interface BancardBillingDetail {
  description: string;
  amount: number | string;
  iva_rate: number | string;
  total_items: number | string;
}

export interface BancardBilling {
  client_ruc: string;
  client_name?: string;
  client_email?: string;
  commerce_stamp?: string;
  commerce_expedition_point?: string;
  commerce_establishment?: string;
  details: BancardBillingDetail[];
}

export interface SingleBuyParams {
  shopProcessId: number | string;
  amount: number | string;
  currency?: BancardCurrency;
  description: string;
  ivaAmount?: number | string;
  billing?: BancardBilling;
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

export interface CardsNewParams {
  cardId: number | string;
  userId: number | string;
  userCellPhone: string;
  userMail: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface ListCardsParams {
  userId: number | string;
}

export interface ChargeParams {
  shopProcessId: number | string;
  amount: number | string;
  currency?: BancardCurrency;
  description: string;
  aliasToken: string;
  additionalData?: string;
  numberOfPayments?: number;
}

export interface DeleteCardParams {
  userId: number | string;
  aliasToken: string;
}

export interface CancelBillingParams {
  shopProcessId: number | string;
  clientRuc: string;
}

export interface PreauthConfirmParams {
  shopProcessId: number | string;
  amount?: number | string;
  billing?: BancardBilling;
}

export interface ClientInfoParams {
  clientRuc: string;
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
  cardsNew(params: CardsNewParams): Promise<BancardRawResponse>;
  listCards(params: ListCardsParams): Promise<BancardRawResponse>;
  charge(params: ChargeParams): Promise<BancardRawResponse>;
  deleteCard(params: DeleteCardParams): Promise<BancardRawResponse>;
  cancelBilling(params: CancelBillingParams): Promise<BancardRawResponse>;
  preauthorizationConfirm(params: PreauthConfirmParams): Promise<BancardRawResponse>;
  getClientInfo(params: ClientInfoParams): Promise<BancardRawResponse>;
  getIframeUrl(processId: string): string;
  getSdkUrl(): string;
  getEnvironment(): string;
}

// ─── Respuestas del servicio (alto nivel) ─────────────────────────────────

export interface SingleBuyResult {
  processId: string;
  shopProcessId: number;
  iframeUrl: string;
  sdkUrl: string;
  status: string;
  environment: BancardEnvironmentName;
  rawResponse: BancardRawResponse;
}

export interface CardsNewResult {
  processId: string;
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

export interface ChargeResult {
  status: string;
  confirmation?: BancardConfirmation | null;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
  /** URL del iframe para tarjetas de débito que requieren confirmación con PIN */
  iframeUrl?: string;
}

export interface DeleteCardResult {
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

export interface CancelBillingResult {
  status: string;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

export interface PreauthConfirmResult {
  status: string;
  confirmation: BancardConfirmation | null;
  messages: BancardMessage[];
  rawResponse: BancardRawResponse;
}

export interface ClientInfoResult {
  status: string;
  client?: { name: string; email: string } | null;
  messages?: BancardMessage[];
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
  // shopProcessId es generado internamente por el backend — NO enviado por el frontend
  amount: number;
  currency?: BancardCurrency;
  description: string;
  ivaAmount?: number;
  billing?: BancardBilling;
  additionalData?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

// ─── Acciones disponibles en el Gateway /api/pagosimple ───────────────────
// Discriminador que el frontend envía para indicar qué operación ejecutar.
export type PagoSimpleAction =
  | 'single-buy'    // Iniciar una nueva compra (flujo principal)
  | 'rollback'      // Revertir una transacción pendiente/no confirmada
  | 'confirmation'  // Consultar el estado de una transacción
  | 'charge-back'   // Devolución de un pago ya aprobado
  | 'cards-new'     // Iniciar proceso de catastro de nueva tarjeta
  | 'list-cards'    // Listar tarjetas catastradas de un usuario
  | 'charge'        // Pago con tarjeta guardada (alias_token)
  | 'delete-card'   // Eliminar una tarjeta catastrada
  | 'cancel-billing'// Cancelar factura electrónica
  | 'preauth-confirm' // Confirmar preautorización
  | 'client-info';  // Consultar datos de cliente por RUC

export interface PagoSimpleRequest {
  // ─── Discriminador (siempre requerido) ─────────────────────────────────
  action: PagoSimpleAction;

  // ─── Auditoría (opcionales, aplican a todas las acciones) ──────────────
  servicio?: string;
  canal?: string;
  id?: string;

  // ─── Referencia de sesión de pago Bancard ───────────────────────────────
  // El frontend NUNCA envía shopProcessId (lo genera el backend).
  // Para rollback / confirmation / charge-back el frontend envía processId
  // (el process_id de Bancard retornado por single-buy) y el backend resuelve
  // internamente el shopProcessId desde su tabla de auditoría.
  processId?: string;    // process_id de Bancard — usado en rollback/confirmation/charge-back

  // ─── Campos para 'single-buy' ──────────────────────────────────────────
  // shopProcessId NO se acepta del frontend — se genera en el backend.
  amount?: number;
  currency?: BancardCurrency;
  description?: string;
  ivaAmount?: number;
  billing?: BancardBilling;
  additionalData?: string;
  returnUrl?: string;
  cancelUrl?: string;

  // ─── Campos para 'cancel-billing' ──────────────────────────────────────
  clientRuc?: string;

  // ─── Campos para 'charge-back' (requiere amount además de processId) ───
  // amount ya está definido arriba

  // ─── Campos para 'cards-new' ──────────────────────────────────────────
  cardId?: number;
  userId?: number;
  userCellPhone?: string;
  userMail?: string;

  // ─── Campos para 'charge' (pago con alias) ─────────────────────────────
  // shopProcessId también se genera internamente para 'charge'
  aliasToken?: string;
  numberOfPayments?: number;
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
