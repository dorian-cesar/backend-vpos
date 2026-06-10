/**
 * tokenGenerator.ts
 * Generación de tokens MD5 requeridos por la API de Bancard vPOS v1.22.
 *
 * Fórmulas oficiales:
 *   single_buy:          md5(private_key + shop_process_id + amount + currency)
 *   single_buy_rollback: md5(private_key + shop_process_id + "rollback" + "0.00" + "PYG")
 *   get_confirmation:    md5(private_key + shop_process_id + "get_confirmation")
 *   charge_back:         md5(private_key + shop_process_id + "charge_back" + amount + currency)
 *   cards_new:           md5(private_key + card_id + user_id + "request_new_card")
 */

import md5 from 'md5';
import type { BancardCurrency } from '../types/bancard.types.js';

/**
 * Genera el token de seguridad para `single_buy`.
 */
export const generateSingleBuyToken = (
  privateKey: string,
  shopProcessId: number | string,
  amount: number | string,
  currency: BancardCurrency,
): string => md5(`${privateKey}${shopProcessId}${amount}${currency}`);

/**
 * Genera el token de seguridad para `single_buy_rollback`.
 */
export const generateRollbackToken = (
  privateKey: string,
  shopProcessId: number | string,
): string => md5(`${privateKey}${shopProcessId}rollback0.00`);

/**
 * Genera el token de seguridad para `get_single_buy_confirmation`.
 */
export const generateGetConfirmationToken = (
  privateKey: string,
  shopProcessId: number | string,
): string => md5(`${privateKey}${shopProcessId}get_confirmation`);

/**
 * Genera el token de seguridad para `charge_back`.
 */
export const generateChargeBackToken = (
  privateKey: string,
  shopProcessId: number | string,
  amount: number | string,
  currency: BancardCurrency,
): string => md5(`${privateKey}${shopProcessId}charge_back${amount}${currency}`);

/**
 * Genera el token de seguridad para `cards/new` (Catastro de Tarjetas).
 */
export const generateCardsNewToken = (
  privateKey: string,
  cardId: number | string,
  userId: number | string,
): string => md5(`${privateKey}${cardId}${userId}request_new_card`);

/**
 * Genera el token de seguridad para `users/:user_id/cards` (Listar Tarjetas).
 */
export const generateListCardsToken = (
  privateKey: string,
  userId: number | string,
): string => md5(`${privateKey}${userId}request_user_cards`);
