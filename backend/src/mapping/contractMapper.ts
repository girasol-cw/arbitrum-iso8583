/**
 * mapping/contractMapper.ts
 * Maps internal PaymentMessage objects to on-chain ABI call parameters.
 *
 * ABI surface used:
 *   authorize(bytes32 txId, address user, address merchant, address token,
 *             uint256 amount, uint48 expiresAt)
 *   capture(bytes32 txId)
 *   release(bytes32 txId)
 */
import type { Address } from 'viem'
import type { PaymentMessage } from './normalizer.js'

// ── authorize ────────────────────────────────────────────────────────────────

export interface AuthorizeCallParams {
  functionName: 'authorize'
  args: [
    txId: `0x${string}`,
    user: Address,
    merchant: Address,
    token: Address,
    amount: bigint,
    expiresAt: number,
  ]
}

export function buildAuthorizeCall(msg: PaymentMessage): AuthorizeCallParams {
  return {
    functionName: 'authorize',
    args: [
      msg.txId,
      msg.userAddress,
      msg.merchantAddress,
      msg.tokenAddress,
      msg.amountWei,
      msg.expiresAt,
    ],
  }
}

// ── capture ──────────────────────────────────────────────────────────────────

export interface CaptureCallParams {
  functionName: 'capture'
  args: [txId: `0x${string}`]
}

export function buildCaptureCall(txId: `0x${string}`): CaptureCallParams {
  return {
    functionName: 'capture',
    args: [txId],
  }
}

// ── release ──────────────────────────────────────────────────────────────────

export interface ReleaseCallParams {
  functionName: 'release'
  args: [txId: `0x${string}`]
}

export function buildReleaseCall(txId: `0x${string}`): ReleaseCallParams {
  return {
    functionName: 'release',
    args: [txId],
  }
}

export type ContractCallParams =
  | AuthorizeCallParams
  | CaptureCallParams
  | ReleaseCallParams
