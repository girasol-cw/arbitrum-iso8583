import type { Address, Hex } from 'viem'

export interface TestAccount {
  name:    string
  address: Address
  pk:      Hex
  roles:   string[]
  badgeClass: string
}

export const TEST_ACCOUNTS: TestAccount[] = [
  {
    name:    'Deployer',
    address: '0x0C015C85340793854e7528943746447713e2C326',
    pk:      '0xe0ed30d19c1b930f70c6ebb1924f9343387c3b5d6ce5a17060fe548088cbed3b',
    roles:   ['DEFAULT_ADMIN_ROLE', 'PAUSER_ROLE', 'TOKEN_ADMIN_ROLE', 'RELAYER_ROLE'],
    badgeClass: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
  },
]

export const HOLD_STATUS_LABELS = ['NONE', 'AUTHORIZED', 'CAPTURED', 'RELEASED', 'EXPIRED'] as const
