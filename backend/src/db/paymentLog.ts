/**
 * db/paymentLog.ts
 * CRUD para la tabla payment_log.
 *
 * Todas las funciones son síncronas (better-sqlite3 es sync).
 * Esto simplifica el flujo: no hay callbacks ni Promises en la capa de datos.
 */
import type Database from 'better-sqlite3'
import { getDb } from './client.js'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'duplicate'
  | 'unsupported'

export interface PaymentLogRow {
  id:               number
  tx_id:            string
  mti:              string
  stan:             string
  rrn:              string
  merchant_ref:     string
  terminal_id:      string
  card_token:       string
  user_address:     string | null
  merchant_address: string | null
  token_address:    string | null
  amount_decimal:   string
  currency_alpha:   string
  action:           string
  status:           PaymentStatus
  tx_hash:          string | null
  block_number:     number | null
  onchain_status:   string | null
  revert_reason:    string | null
  iso_raw:          string
  error_code:       string | null
  created_at:       number
  updated_at:       number
}

export interface CreatePaymentLogParams {
  txId:             string
  mti:              string
  stan:             string
  rrn:              string
  merchantRef:      string
  terminalId:       string
  cardToken:        string
  userAddress?:     string
  merchantAddress?: string
  tokenAddress?:    string
  amountDecimal:    string
  currencyAlpha:    string
  action:           string
  isoRaw:           unknown
}

function db(): Database.Database { return getDb() }

// ── payment_log ───────────────────────────────────────────────────────────────

export function createPaymentLog(params: CreatePaymentLogParams): void {
  db().prepare(`
    INSERT INTO payment_log
      (tx_id, mti, stan, rrn, merchant_ref, terminal_id, card_token,
       user_address, merchant_address, token_address,
       amount_decimal, currency_alpha, action, iso_raw)
    VALUES
      (@txId, @mti, @stan, @rrn, @merchantRef, @terminalId, @cardToken,
       @userAddress, @merchantAddress, @tokenAddress,
       @amountDecimal, @currencyAlpha, @action, @isoRaw)
  `).run({
    ...params,
    userAddress:     params.userAddress     ?? null,
    merchantAddress: params.merchantAddress ?? null,
    tokenAddress:    params.tokenAddress    ?? null,
    isoRaw:          JSON.stringify(params.isoRaw),
  })
}

export function getPaymentLog(txId: string): PaymentLogRow | null {
  return (db().prepare('SELECT * FROM payment_log WHERE tx_id = ?').get(txId) ?? null) as PaymentLogRow | null
}

export function updatePaymentStatus(
  txId:   string,
  status: PaymentStatus,
  extra?: Partial<Pick<PaymentLogRow, 'tx_hash' | 'block_number' | 'onchain_status' | 'revert_reason' | 'error_code'>>,
): void {
  const updates: string[] = ['status = @status', 'updated_at = unixepoch()']
  const params: Record<string, unknown> = { txId, status }

  if (extra?.tx_hash       !== undefined) { updates.push('tx_hash = @txHash');            params.txHash        = extra.tx_hash }
  if (extra?.block_number  !== undefined) { updates.push('block_number = @blockNumber');  params.blockNumber   = extra.block_number }
  if (extra?.onchain_status !== undefined){ updates.push('onchain_status = @onchainStatus'); params.onchainStatus = extra.onchain_status }
  if (extra?.revert_reason !== undefined) { updates.push('revert_reason = @revertReason'); params.revertReason = extra.revert_reason }
  if (extra?.error_code    !== undefined) { updates.push('error_code = @errorCode');      params.errorCode     = extra.error_code }

  db().prepare(`UPDATE payment_log SET ${updates.join(', ')} WHERE tx_id = @txId`).run(params)
}

export function listPaymentLogs(limit = 100, offset = 0): PaymentLogRow[] {
  return db()
    .prepare('SELECT * FROM payment_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as PaymentLogRow[]
}

/** Devuelve true si ya existe un registro con ese txId (idempotencia). */
export function isDuplicate(txId: string): boolean {
  return getPaymentLog(txId) !== null
}
