/**
 * relayer/wallet.ts
 * Creates the viem clients and manages the relayer nonce.
 *
 * Why a local nonce?
 *   If two ISO messages arrive at the same time and both call
 *   getTransactionCount, they could get the same nonce and one would fail.
 *   A local counter guarantees every tx uses a unique nonce without hitting
 *   the RPC for every submission.
 */
import {
  createWalletClient,
  createPublicClient,
  fallback,
  http,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { config, rpcUrls } from '../config.js'
import { logger } from '../observability/logger.js'

// Singletons – created once when the module is imported.
export const account = privateKeyToAccount(config.RELAYER_PRIVATE_KEY as `0x${string}`)

export function rpcTransport(): Transport {
  const transports = rpcUrls().map((url) => http(url, { timeout: 30_000 }))
  return transports.length === 1 ? transports[0] : fallback(transports)
}

export const walletClient: WalletClient<Transport, typeof arbitrumSepolia, typeof account> = createWalletClient({
  account,
  chain: arbitrumSepolia,
  transport: rpcTransport(),
})

export const publicClient: PublicClient<Transport, typeof arbitrumSepolia> = createPublicClient({
  chain: arbitrumSepolia,
  transport: rpcTransport(),
})

// ── Local nonce ───────────────────────────────────────────────────────────────
let _nonce: number | null = null

/** Sync the nonce from chain. Called during startup. */
export async function syncNonce(): Promise<void> {
  _nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })
  logger.debug({ nonce: _nonce, address: account.address }, 'Nonce synced')
}

/** Return the next nonce and increment the local counter. */
export async function nextNonce(): Promise<number> {
  if (_nonce === null) await syncNonce()
  return _nonce!++
}

/** Force a resync after a nonce error. */
export async function resetNonce(): Promise<void> {
  logger.warn('Nonce conflict – resyncing from chain')
  _nonce = null
  await syncNonce()
}

export function relayerAddress(): string {
  return account.address
}
