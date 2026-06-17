/**
 * db/paymentLog.ts
 * CRUD helpers for the payment_log table using Drizzle ORM (PostgreSQL).
 *
 * All operations are async (postgres-js driver returns Promises).
 */
import { eq, desc, sql, and, inArray } from 'drizzle-orm'
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
  extra?: Partial<Pick<PaymentLogRow, 'tx_hash' | 'block_number' | 'onchain_status' | 'revert_reason' | 'retry_count' | 'last_error' | 'error_code' | 'action'>>,
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
      ...(extra?.action         !== undefined && { action:         extra.action }),
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

/**
 * Return true if a record already exists for this txId with the given action.
 * Used for capture/release which intentionally share the txId with the
 * original authorize — so we must check (txId + action), not just txId.
 */
export async function isDuplicateAction(txId: string, action: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: paymentLog.id })
    .from(paymentLog)
    .where(and(eq(paymentLog.tx_id, txId), eq(paymentLog.action, action)))
    .limit(1)
  return rows.length > 0
}

/**
 * Look up an existing authorize/capture payment by the original STAN.
 * Used by reversals to resolve the correct on-chain txId without relying on
 * a matching RRN (reversal messages carry a new RRN, not the original one).
 * Optionally scoped to a specific merchantRef + terminalId for safety.
 */
export async function getPaymentLogByStan(
  stan:        string,
  merchantRef: string,
  terminalId:  string,
): Promise<PaymentLogRow | null> {
  const rows = await getDb()
    .select()
    .from(paymentLog)
    .where(
      and(
        eq(paymentLog.stan,         stan),
        eq(paymentLog.merchant_ref, merchantRef),
        eq(paymentLog.terminal_id,  terminalId),
        inArray(paymentLog.action,  ['authorize', 'authorize_and_capture']),
      ),
    )
    .orderBy(desc(paymentLog.created_at))
    .limit(1)
  return rows[0] ?? null
}
