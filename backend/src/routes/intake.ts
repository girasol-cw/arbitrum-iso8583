/**
 * routes/intake.ts
 * Core ISO 8583 intake orchestrator.
 *
 * This module glues together:
 *  parse → route → deduplicate → normalise → map → submit → wait for receipt
 *
 * It is called by the Express route handler (routes/intake.ts) and can also
 * be invoked directly in tests.
 */
import { parseIsoMessage } from '../iso/parser.js'
import { routeIsoMessage } from '../iso/router.js'
import { deriveTxId, deriveReversalTxId } from '../mapping/txId.js'
import { normalize } from '../mapping/normalizer.js'
import {
  buildAuthorizeCall,
  buildCaptureCall,
  buildReleaseCall,
} from '../mapping/contractMapper.js'
import { submitContractCall } from '../relayer/submitter.js'
import { waitForReceipt } from '../relayer/responseHandler.js'
import {
  isDuplicate,
  createPaymentLog,
  updatePaymentStatus,
  getPaymentLog,
} from '../db/paymentLog.js'
import { classifyError } from '../errors/classifier.js'
import { logger } from '../observability/logger.js'
import {
  isoMessagesReceived,
  isoMessagesRouted,
  isoDuplicates,
  errorClassified,
} from '../observability/metrics.js'

export interface IntakeResponse {
  txId: string
  action: string
  status: 'approved' | 'declined' | 'pending' | 'duplicate' | 'unsupported'
  isoResponseCode: string
  txHash?: string
  blockNumber?: number
  message?: string
}

/**
 * Process a single raw ISO 8583 JSON message end-to-end.
 * Always resolves (never throws) – errors are mapped to decline responses.
 */
export async function processIsoMessage(rawInput: unknown): Promise<IntakeResponse> {
  // ── 1. Parse ISO fields ───────────────────────────────────────────────────
  let parsed
  try {
    parsed = parseIsoMessage(rawInput)
  } catch (err) {
    logger.warn({ err }, 'ISO parse error')
    return {
      txId: '',
      action: 'parse_error',
      status: 'declined',
      isoResponseCode: '30', // Format error
      message: (err as Error).message,
    }
  }

  isoMessagesReceived.inc({ mti: parsed.mti })
  const log = logger.child({ mti: parsed.mti, stan: parsed.stan, rrn: parsed.rrn })

  // ── 2. Route ──────────────────────────────────────────────────────────────
  const routing = routeIsoMessage(parsed)
  isoMessagesRouted.inc({ action: routing.action })
  log.info({ action: routing.action }, 'ISO message routed')

  if (routing.action === 'heartbeat') {
    return { txId: '', action: 'heartbeat', status: 'approved', isoResponseCode: '00' }
  }

  if (routing.action === 'unsupported') {
    return {
      txId: '',
      action: 'unsupported',
      status: 'unsupported',
      isoResponseCode: '12', // Invalid transaction
      message: routing.reason,
    }
  }

  // ── 3. Derive txId ────────────────────────────────────────────────────────
  const txId =
    routing.action === 'release'
      ? deriveReversalTxId(parsed)
      : deriveTxId(parsed)

  // ── 4. Idempotency check ──────────────────────────────────────────────────
  if (await isDuplicate(txId)) {
    isoDuplicates.inc()
    log.info({ txId }, 'Duplicate ISO message – returning cached result')
    const existing = await getPaymentLog(txId)
    return {
      txId,
      action: routing.action,
      status: 'duplicate',
      isoResponseCode: '94', // Duplicate transmission
      txHash: existing?.tx_hash ?? undefined,
      message: 'Duplicate message – previous submission found',
    }
  }

  // ── 5. Normalise ──────────────────────────────────────────────────────────
  let paymentMsg
  try {
    paymentMsg = normalize(parsed, txId)
  } catch (err) {
    log.warn({ err }, 'Normalisation failed (card/merchant mapping)')
    const classified = classifyError(err)
    errorClassified.inc({ code: classified.code })

    // Log to DB even if we can't fully normalise
    await createPaymentLog({
      txId,
      mti: parsed.mti,
      stan: parsed.stan,
      rrn: parsed.rrn,
      merchantRef: parsed.merchantRef,
      terminalId: parsed.terminalId,
      cardToken: parsed.cardToken,
      amountDecimal: parsed.amountDecimal,
      currencyAlpha: parsed.currencyAlpha,
      action: routing.action,
      isoRaw: parsed.raw,
    })
    await updatePaymentStatus(txId, 'failed', { error_code: classified.code })

    return {
      txId,
      action: routing.action,
      status: 'declined',
      isoResponseCode: classified.isoResponseCode,
      message: classified.message,
    }
  }

  // ── 6. Persist initial log ────────────────────────────────────────────────
  await createPaymentLog({
    txId,
    mti: parsed.mti,
    stan: parsed.stan,
    rrn: parsed.rrn,
    merchantRef: parsed.merchantRef,
    terminalId: parsed.terminalId,
    cardToken: parsed.cardToken,
    userAddress: paymentMsg.userAddress,
    merchantAddress: paymentMsg.merchantAddress,
    tokenAddress: paymentMsg.tokenAddress,
    amountDecimal: parsed.amountDecimal,
    currencyAlpha: parsed.currencyAlpha,
    action: routing.action,
    isoRaw: parsed.raw,
  })

  // ── 7. Build contract call params ─────────────────────────────────────────
  let callParams
  switch (routing.action) {
    case 'authorize':
    case 'authorize_and_capture':
      callParams = buildAuthorizeCall(paymentMsg)
      break
    case 'capture':
      callParams = buildCaptureCall(txId)
      break
    case 'release':
      callParams = buildReleaseCall(txId)
      break
  }

  // ── 8. Submit to chain ────────────────────────────────────────────────────
  await updatePaymentStatus(txId, 'submitted')
  const submittedAt = Date.now()
  const submitResult = await submitContractCall(callParams!, txId)

  if (!submitResult.success) {
    await updatePaymentStatus(txId, 'failed', {
      error_code: submitResult.classified.code,
      retry_count: submitResult.attempts - 1,
      last_error: `${submitResult.classified.code}${submitResult.retryable ? ':retryable' : ''}`,
    })
    return {
      txId,
      action: routing.action,
      status: 'declined',
      isoResponseCode: submitResult.classified.isoResponseCode,
      message: submitResult.classified.message,
    }
  }

  // ── 9. Wait for receipt ───────────────────────────────────────────────────
  const receipt = await waitForReceipt(
    txId,
    submitResult.txHash,
    routing.action,
    submittedAt,
  )

  const approved = receipt.outcome !== 'reverted' && receipt.outcome !== 'timeout'
  const pending = receipt.outcome === 'timeout'

  // For authorize_and_capture: if auth confirmed, immediately submit capture
  if (routing.action === 'authorize_and_capture' && approved) {
    log.info({ txId }, 'authorize_and_capture: submitting capture after auth confirmed')
    const captureResult = await submitContractCall(buildCaptureCall(txId), txId + '_capture')
    if (captureResult.success) {
      await waitForReceipt(
        txId,
        captureResult.txHash,
        'capture',
        Date.now(),
      )
    }
  }

  return {
    txId,
    action: routing.action,
    status: pending ? 'pending' : approved ? 'approved' : 'declined',
    isoResponseCode: receipt.isoResponseCode,
    txHash: receipt.txHash,
    blockNumber: receipt.blockNumber ?? undefined,
    message: receipt.revertReason,
  }
}
