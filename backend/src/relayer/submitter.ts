/**
 * relayer/submitter.ts
 * Envía una transacción al contrato y devuelve el txHash.
 *
 * Flujo:
 *   1. Estimar gas → si revierte, devolver error sin gastar gas en cadena.
 *   2. Obtener siguiente nonce local.
 *   3. Enviar tx con writeContract.
 *   4. Si hay conflicto de nonce → resincronizar y reintentar una vez.
 *   5. Cualquier otro error → devolver SubmitError sin reintentos.
 *
 * ¿Por qué no retry automático?
 *   Para MVP preferimos fallo rápido y visible. Los reintentos con backoff
 *   añaden complejidad de estado; si se necesitan en producción, se agrega
 *   una cola en la base de datos.
 */
import { type Address } from 'viem'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'
import { txSubmitted, errorClassified } from '../observability/metrics.js'
import { SETTLEMENT_ABI } from './abi.js'
import { walletClient, publicClient, account, nextNonce, resetNonce } from './wallet.js'
import { classifyError } from '../errors/classifier.js'
import type { ContractCallParams } from '../mapping/contractMapper.js'

export interface SubmitResult { success: true;  txHash: `0x${string}` }
export interface SubmitError  { success: false; classified: ReturnType<typeof classifyError> }
export type SubmitOutcome = SubmitResult | SubmitError

const CONTRACT = config.CONTRACT_ADDRESS as Address

export async function submitContractCall(
  params: ContractCallParams,
  txId: string,
  attempt = 1,
): Promise<SubmitOutcome> {
  const log = logger.child({ txId, action: params.functionName, attempt })

  try {
    // 1. Estimación de gas – detecta reverts antes de gastar gas real
    let gas: bigint
    try {
      const raw = await publicClient.estimateContractGas({
        address: CONTRACT,
        abi: SETTLEMENT_ABI,
        functionName: params.functionName as any,
        args: params.args as any,
        account,
      })
      gas = raw * 12n / 10n  // +20% de buffer
    } catch (err) {
      const classified = classifyError(err)
      errorClassified.inc()
      log.warn({ classified }, 'Estimación de gas falló – la tx revertería')
      return { success: false, classified }
    }

    // 2. Nonce local
    const nonce = await nextNonce()
    log.info({ nonce, gas: gas.toString() }, 'Enviando transacción')

    // 3. Enviar
    const txHash = await walletClient.writeContract({
      address: CONTRACT,
      abi: SETTLEMENT_ABI,
      functionName: params.functionName as any,
      args: params.args as any,
      nonce,
      gas,
    })

    txSubmitted.inc()
    log.info({ txHash }, 'Transacción enviada')
    return { success: true, txHash }

  } catch (err) {
    const classified = classifyError(err)
    errorClassified.inc()

    // Conflicto de nonce: resincronizar y reintentar una sola vez
    if (classified.code === 'NONCE_CONFLICT' && attempt === 1) {
      await resetNonce()
      log.warn('Conflicto de nonce – reintentando una vez')
      return submitContractCall(params, txId, 2)
    }

    log.error({ classified }, 'Envío fallido')
    return { success: false, classified }
  }
}
