/**
 * relayer/responseHandler.ts
 * Waits for a transaction receipt and determines the onchain outcome.
 *
 * Event mapping → outcome:
 *   PaymentAuthorized → 'authorized'  (approved)
 *   PaymentCaptured   → 'captured'    (captured)
 *   PaymentReleased   → 'released'    (reversed)
 *   receipt.status === 'reverted' → 'reverted' (declined)
 *   timeout (>2 min) → 'timeout'
 */
import { type Address, decodeEventLog } from 'viem'
import { SETTLEMENT_ABI } from './abi.js'
import { publicClient } from './wallet.js'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'
import { txConfirmed } from '../observability/metrics.js'
import { updatePaymentStatus } from '../db/paymentLog.js'
import { classifyError } from '../errors/classifier.js'

export type OnchainOutcome = 'authorized' | 'captured' | 'released' | 'reverted' | 'timeout'

export interface ReceiptResult {
  outcome:         OnchainOutcome
  /** ISO 8583 response code */
  isoResponseCode: string
  txHash:          string
  blockNumber:     number | null
  revertReason?:   string
}

const CONTRACT = config.CONTRACT_ADDRESS as Address

export async function waitForReceipt(
  txId: string,
  txHash: `0x${string}`,
  action: string,
  submittedAt = Date.now(),
): Promise<ReceiptResult> {
  const log = logger.child({ txId, txHash, action })

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
      timeout: 120_000,  // 2 minutes maximum
    })

    // ── Reverted ───────────────────────────────────────────────────────────
    if (receipt.status === 'reverted') {
      let revertReason = 'unknown revert'
      try { revertReason = await getRevertReason(txHash) } catch { /* ignore */ }

      log.warn({ blockNumber: receipt.blockNumber.toString(), revertReason }, 'Transaction reverted')
      txConfirmed.inc()

      await updatePaymentStatus(txId, 'failed', {
        tx_hash:        txHash,
        block_number:   Number(receipt.blockNumber),
        onchain_status: 'reverted',
        revert_reason:  revertReason,
      })
      return { outcome: 'reverted', isoResponseCode: '05', txHash, blockNumber: Number(receipt.blockNumber), revertReason }
    }

    // ── Successful – read events ──────────────────────────────────────────────
    const outcome = extractOutcome(receipt.logs)
    const elapsed = (Date.now() - submittedAt) / 1000
    log.info({ outcome, blockNumber: receipt.blockNumber.toString(), elapsed }, 'Transaction confirmed')
    txConfirmed.inc()

    await updatePaymentStatus(txId, 'confirmed', {
      tx_hash:        txHash,
      block_number:   Number(receipt.blockNumber),
      onchain_status: outcome,
    })
    return { outcome, isoResponseCode: '00', txHash, blockNumber: Number(receipt.blockNumber) }

  } catch (err) {
    const classified = classifyError(err)
    log.error({ err, classified }, 'waitForReceipt failed')

    await updatePaymentStatus(txId, 'pending', {
      tx_hash:        txHash,
      onchain_status: 'timeout',
      revert_reason:  classified.message,
      last_error:     classified.code,
    })
    return { outcome: 'timeout', isoResponseCode: '96', txHash, blockNumber: null }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Log = { topics: readonly `0x${string}`[]; data: `0x${string}` }

function extractOutcome(logs: Log[]): OnchainOutcome {
  for (const log of logs) {
    try {
      if (log.topics.length === 0) continue
      const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]]
      const decoded = decodeEventLog({ abi: SETTLEMENT_ABI, data: log.data, topics })
      if (decoded.eventName === 'PaymentAuthorized') return 'authorized'
      if (decoded.eventName === 'PaymentCaptured')   return 'captured'
      if (decoded.eventName === 'PaymentReleased')   return 'released'
    } catch { /* not our event */ }
  }
  return 'authorized'
}

async function getRevertReason(txHash: `0x${string}`): Promise<string> {
  const tx = await publicClient.getTransaction({ hash: txHash })
  try {
    await publicClient.call({ to: tx.to, data: tx.input, value: tx.value, blockNumber: tx.blockNumber! })
    return 'no revert reason'
  } catch (err: unknown) {
    const e = err as { shortMessage?: string; message?: string }
    return e.shortMessage ?? e.message ?? 'unknown'
  }
}
