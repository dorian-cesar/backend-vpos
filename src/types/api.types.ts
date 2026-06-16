/**
 * api.types.ts
 * Tipos genéricos internos del API Express que no son específicos de Bancard.
 *
 * Estos tipos son usados por los controladores y middlewares del backend.
 * Para los contratos exactos de entrada/salida por endpoint, ver: src/dtos/
 */

import type { BancardMessage } from './bancard.types.js';

// ─── Respuestas HTTP genéricas del API propio ──────────────────────────────

/** Respuesta genérica de éxito. */
export interface ApiSuccessResponse<T> {
  status: 'success';
  message?: string;
  data: T;
}

/** Respuesta genérica de error. */
export interface ApiErrorResponse {
  status: 'error';
  message: string;
  errors?: Array<{ field: string; message: string }>;
  bancardMessages?: BancardMessage[];
  detail?: string;
}
