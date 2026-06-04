/**
 * relayer/wallet.ts
 * Crea los clientes de viem y gestiona el nonce del relayer.
 *
 * ¿Por qué nonce local?
 *   Si llegan dos mensajes ISO simultáneos y ambos llaman a
 *   getTransactionCount, obtendrían el mismo nonce y uno rompería.
 *   Con un contador local garantizamos que cada tx usa un nonce único
 *   sin ir al RPC en cada envío.
 */
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'

// Singletons – se crean una vez al importar el módulo
export const account = privateKeyToAccount(config.RELAYER_PRIVATE_KEY as `0x${string}`)

export const walletClient = createWalletClient({
  account,
  chain: arbitrumSepolia,
  transport: http(config.RPC_URL, { timeout: 30_000 }),
})

export const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(config.RPC_URL, { timeout: 30_000 }),
})

// ── Nonce local ───────────────────────────────────────────────────────────────
let _nonce: number | null = null

/** Sincroniza el nonce desde la cadena. Se llama al arrancar. */
export async function syncNonce(): Promise<void> {
  _nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })
  logger.debug({ nonce: _nonce, address: account.address }, 'Nonce sincronizado')
}

/** Devuelve el siguiente nonce e incrementa el contador local. */
export async function nextNonce(): Promise<number> {
  if (_nonce === null) await syncNonce()
  return _nonce!++
}

/** Fuerza resincronización (se llama tras un error de nonce). */
export async function resetNonce(): Promise<void> {
  logger.warn('Nonce conflict – resincronizando desde la cadena')
  _nonce = null
  await syncNonce()
}

export function relayerAddress(): string {
  return account.address
}
