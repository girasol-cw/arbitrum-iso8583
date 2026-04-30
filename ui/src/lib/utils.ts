import { formatUnits, parseUnits } from 'viem'
import type { Address } from 'viem'

export function shortenAddress(addr: string, chars = 6) {
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`
}

export function formatToken(amount: bigint, decimals: number): string {
  return parseFloat(formatUnits(amount, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })
}

export function toTokenAmount(human: string, decimals: number): bigint {
  try {
    return parseUnits(human, decimals)
  } catch {
    return 0n
  }
}

export function randomBytes32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

export function timestampStr(ts: bigint | number): string {
  return new Date(Number(ts) * 1000).toLocaleString()
}
