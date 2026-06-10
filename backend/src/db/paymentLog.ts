/**
 * db/paymentLog.ts
 * CRUD helpers for the payment_log table using Drizzle ORM (PostgreSQL).
 *
 * All operations are async (postgres-js driver returns Promises).
 */
import { eq, desc, sql } from 'drizzle-orm'
import { getDb } from './client.js'
import { paymentLog } from './schema.js'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full row as returned by Drizzle, derived from the schema. */
export type PaymentLogRow = typeof paymentLog.$inferSelect

export type PaymentStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'duplicate'
  | 'unsupported'

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

// ── payment_log ───────────────────────────────────────────────────────────────

export async function createPaymentLog(params: CreatePaymentLogParams): Promise<void> {
  await getDb().insert(paymentLog).values({
    tx_id:            params.txId,
    mti:              params.mti,
    stan:             params.stan,
    rrn:              params.rrn,
    merchant_ref:     params.merchantRef,
    terminal_id:      params.terminalId,
    card_token:       params.cardToken,
    user_address:     params.userAddress     ?? null,
    merchant_address: params.merchantAddress ?? null,
    token_address:    params.tokenAddress    ?? null,
    amount_decimal:   params.amountDecimal,
    currency_alpha:   params.currencyAlpha,
    action:           params.action,
    iso_raw:          JSON.stringify(params.isoRaw),
  })
}

export async function getPaymentLog(txId: string): Promise<PaymentLogRow | null> {
  const rows = await getDb()
    .select()
    .from(paymentLog)
    .where(eq(paymentLog.tx_id, txId))
    .limit(1)
  return rows[0] ?? null
}

export async function updatePaymentStatus(
  txId:   string,
  status: PaymentStatus,
  extra?: Partial<Pick<PaymentLogRow, 'tx_hash' | 'block_number' | 'onchain_status' | 'revert_reason' | 'retry_count' | 'last_error' | 'error_code'>>,
): Promise<void> {
  await getDb()
    .update(paymentLog)
    .set({
      status,
      updated_at:     sql`extract(epoch from now())::integer`,
      ...(extra?.tx_hash        !== undefined && { tx_hash:        extra.tx_hash }),
      ...(extra?.block_number   !== undefined && { block_number:   extra.block_number }),
      ...(extra?.onchain_status !== undefined && { onchain_status: extra.onchain_status }),
      ...(extra?.revert_reason  !== undefined && { revert_reason:  extra.revert_reason }),
      ...(extra?.retry_count    !== undefined && { retry_count:    extra.retry_count }),
      ...(extra?.last_error     !== undefined && { last_error:     extra.last_error }),
      ...(extra?.error_code     !== undefined && { error_code:     extra.error_code }),
    })
    .where(eq(paymentLog.tx_id, txId))
}

export async function listPaymentLogs(limit = 100, offset = 0): Promise<PaymentLogRow[]> {
  return getDb()
    .select()
    .from(paymentLog)
    .orderBy(desc(paymentLog.created_at))
    .limit(limit)
    .offset(offset)
}

/** Return true if a record already exists for this txId (idempotency). */
export async function isDuplicate(txId: string): Promise<boolean> {
  return (await getPaymentLog(txId)) !== null
}
