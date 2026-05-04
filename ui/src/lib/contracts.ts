import type { Address } from 'viem'

/** Arbitrum Sepolia deployment – May 2026 */
export const ARBITRUM_SEPOLIA_RPC =
  'https://lb.drpc.live/arbitrum-sepolia/AuajrTfUKUDcljFTxiXAxPOrBZbcQJQR8Jr2uuQ63qxe'

export const DEPLOYED = {
  impl:  '0x94a7b0e6052b8B2836A4BE189e73f9780784AC9B' as Address,
  proxy: '0x73F2dEA754Bd062911e39484bb2ee3f5055C88a6' as Address,
  usdc:  '0x8c31cA664CDD3cC4BCa764f340788E78148580a4' as Address,
  /** Fill in after retrieving from deployment logs */
  weth:  '' as Address | '',
} as const
