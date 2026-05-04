import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import type { Hex } from 'viem'
import { ARBITRUM_SEPOLIA_RPC } from './contracts'

let _rpcUrl = ARBITRUM_SEPOLIA_RPC

export function setRpcUrl(url: string) {
  _rpcUrl = url
}

export function getPublicClient() {
  return createPublicClient({
    chain: arbitrumSepolia,
    transport: http(_rpcUrl),
  })
}

export function getWalletClient(pk: Hex) {
  const account = privateKeyToAccount(pk)
  return createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(_rpcUrl),
  })
}
