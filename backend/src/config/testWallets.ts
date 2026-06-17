/**
 * config/testWallets.ts
 * Test wallets derived from the testing mnemonic.
 *
 * Mnemonic: bamboo scout soldier devote tooth ugly foot drive lamp upset arrange grape
 * Derivation path: m/44'/60'/0'/0/i  (BIP-44 standard Ethereum)
 *
 * ⚠️  TESTNET / DEVELOPMENT ONLY — never use on mainnet.
 *
 * To fund these wallets on Arbitrum Sepolia:
 *   cd contracts
 *   forge script script/FundUsers.s.sol \
 *     --rpc-url arbitrum-sepolia \
 *     --private-key $DEPLOYER_PK \
 *     --broadcast -vvvv
 *   cd ../backend
 *   tsx scripts/seed-card-mapping.ts
 */

export interface TestWallet {
  /** Card token used in ISO 8583 / card_mapping table */
  cardToken:   string
  /** Derived Ethereum address (checksummed) */
  address:     `0x${string}`
  /** Private key — testnet only */
  privateKey:  `0x${string}`
  /** BIP-44 derivation index */
  index:       number
}

export const TEST_MNEMONIC =
  'bamboo scout soldier devote tooth ugly foot drive lamp upset arrange grape'

export const TEST_WALLETS: TestWallet[] = [
  {
    cardToken:  'TOK_TEST_001',
    address:    '0x5f7215df3fbd70DDbb68CeC0dC0a23E4Ab77b562',
    privateKey: '0x8329e924f4a26c43b59303705493aab93226cbf02836c36755e46e73d9313392',
    index:      0,
  },
  {
    cardToken:  'TOK_TEST_002',
    address:    '0xC480FF6Dc39Eb77D35F96CaA281EF08EBcB63C94',
    privateKey: '0x0d22d1b73c30cc545056ff5f30ca58c4c515dc33d8ea5c7ef3f726e0482fc721',
    index:      1,
  },
  {
    cardToken:  'TOK_TEST_003',
    address:    '0x9b96854113FEfc8405f553d6323c150237C5280d',
    privateKey: '0xa00bc16d9f51c8cbe2917e0c6cd5286fc4bc6a33c897287c3678405e7b879719',
    index:      2,
  },
  {
    cardToken:  'TOK_TEST_004',
    address:    '0x82225D7FB76b961F03B063fDB5B25BEE891e50B3',
    privateKey: '0xa3c555cb936083b5739ee98be199f96fca3b4b866a2cfb9d0f5304a28dc36e39',
    index:      3,
  },
]

/** card_token → address mapping (same format as the old card-mapping.json) */
export const TEST_CARD_MAP: Record<string, `0x${string}`> = Object.fromEntries(
  TEST_WALLETS.map((w) => [w.cardToken, w.address]),
)

/** merchant_ref → address mapping for local ISO/POS simulators */
export const TEST_MERCHANT_MAP: Record<string, `0x${string}`> = {
  MERCHANT001: '0x0C015C85340793854e7528943746447713e2C326',
  MERCHANT002: '0x5f7215df3fbd70DDbb68CeC0dC0a23E4Ab77b562',
  MERCHANT003: '0xC480FF6Dc39Eb77D35F96CaA281EF08EBcB63C94',
}
