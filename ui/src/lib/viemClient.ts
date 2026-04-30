import {
  createPublicClient,
  createWalletClient,
  http,
  privateKeyToAccount,
} from 'viem'
import { anvil } from 'viem/chains'
import type { Hex } from 'viem'

let _rpcUrl = 'http://127.0.0.1:8545'

export function setRpcUrl(url: string) {
  _rpcUrl = url
}

export function getPublicClient() {
  return createPublicClient({
    chain: anvil,
    transport: http(_rpcUrl),
  })
}

export function getWalletClient(pk: Hex) {
  const account = privateKeyToAccount(pk)
  return createWalletClient({
    account,
    chain: anvil,
    transport: http(_rpcUrl),
  })
}
