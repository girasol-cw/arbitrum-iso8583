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
    name:    'Admin',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    pk:      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478ce64388c4a6483fcf8b60c6',
    roles:   ['DEFAULT_ADMIN_ROLE', 'PAUSER_ROLE', 'TOKEN_ADMIN_ROLE'],
    badgeClass: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
  },
  {
    name:    'Relayer',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    pk:      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    roles:   ['RELAYER_ROLE'],
    badgeClass: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
  },
  {
    name:    'User A',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    pk:      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    roles:   [],
    badgeClass: 'bg-green-900/40 text-green-300 border border-green-700/50',
  },
  {
    name:    'Merchant',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    pk:      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    roles:   [],
    badgeClass: 'bg-orange-900/40 text-orange-300 border border-orange-700/50',
  },
]

export const HOLD_STATUS_LABELS = ['NONE', 'AUTHORIZED', 'CAPTURED', 'RELEASED', 'EXPIRED'] as const
