/**
 * relayer/submitter.ts
 * Sends a transaction to the contract and returns the txHash.
 *
 * Flow:
 *   1. Estimate gas → if it reverts, return error without spending on-chain gas.
 *   2. Get next local nonce.
 *   3. Send tx with writeContract.
 *   4. If nonce conflict → re-sync and retry once.
 *   5. Any other error → return SubmitError without retries.
 *
 * Why no automatic retry?
 *   For MVP we prefer fast and visible failure. Retries with backoff
 *   add state complexity; if needed in production, a queue in the database
 *   can be added.
 */
import { type Address } from 'viem'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'
import { txSubmitted, errorClassified } from '../observability/metrics.js'
import { SETTLEMENT_ABI } from './abi.js'
import { walletClient, publicClient, account, nextNonce, resetNonce } from './wallet.js'
import { classifyError } from '../errors/classifier.js'
import type { ContractCallParams } from '../mapping/contractMapper.js'

export interface SubmitResult { success: true;  txHash: `0x${string}`; attempts: number }
export interface SubmitError  { success: false; classified: ReturnType<typeof classifyError>; attempts: number; retryable: boolean }
export type SubmitOutcome = SubmitResult | SubmitError

const CONTRACT = config.CONTRACT_ADDRESS as Address

export async function submitContractCall(
  params: ContractCallParams,
  txId: string,
  attempt = 1,
): Promise<SubmitOutcome> {
  const log = logger.child({ txId, action: params.functionName, attempt })

  try {
    // 1. Gas estimation – detects reverts before spending real gas
    let gas: bigint
    try {
      const raw = await publicClient.estimateContractGas({
        address: CONTRACT,
        abi: SETTLEMENT_ABI,
        functionName: params.functionName as any,
        args: params.args as any,
        account,
      })
      gas = raw * 12n / 10n  // +20% buffer
      const gasLimit = BigInt(config.GAS_LIMIT)
      if (gas > gasLimit) gas = gasLimit
    } catch (err) {
      const classified = classifyError(err)
      errorClassified.inc()
      log.warn({ classified }, 'Gas estimation failed – the tx would revert')
      return { success: false, classified, attempts: attempt, retryable: false }
    }

    // 2. Local nonce
    const nonce = await nextNonce()
    log.info({ nonce, gas: gas.toString() }, 'Sending transaction')

    // 3. Send
    const txHash = await walletClient.writeContract({
      address: CONTRACT,
      abi: SETTLEMENT_ABI,
      functionName: params.functionName as any,
      args: params.args as any,
      nonce,
      gas,
    })

    txSubmitted.inc()
    log.info({ txHash }, 'Transaction sent')
    return { success: true, txHash, attempts: attempt }

  } catch (err) {
    const classified = classifyError(err)
    errorClassified.inc()

    // Nonce conflict: re-sync and retry once 
    if (classified.code === 'NONCE_CONFLICT' && attempt === 1) {
      await resetNonce()
      log.warn('Nonce conflict – retrying once')
      return submitContractCall(params, txId, 2)
    }

    log.error({ classified }, 'TX Failed')
    return {
      success: false,
      classified,
      attempts: attempt,
      retryable: classified.code === 'RPC_FAILURE' || classified.code === 'NONCE_CONFLICT',
    }
  }
}
