import type { Address } from 'viem'

/** Arbitrum Sepolia deployment – May 2026 */
export const ARBITRUM_SEPOLIA_RPC =
  'https://lb.drpc.live/arbitrum-sepolia/AuajrTfUKUDcljFTxiXAxPOrBZbcQJQR8Jr2uuQ63qxe'

export const DEPLOYED = {
  impl:  '0x655d759764122E84B8cA0B156eE320B2D9Bd50B3' as Address,
  proxy: '0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72' as Address,
  usdc:  '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA' as Address,
  /** Fill in after retrieving from deployment logs */
  weth:  '' as Address | '',
} as const
