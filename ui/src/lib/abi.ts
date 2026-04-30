export const SETTLEMENT_ABI = [
  // ── Write ──────────────────────────────────────────────────────────────────
  {
    name: 'configureToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',   type: 'address' },
      { name: 'allowed', type: 'bool'    },
    ],
    outputs: [],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'authorize',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'txId',      type: 'bytes32'  },
      { name: 'user',      type: 'address'  },
      { name: 'merchant',  type: 'address'  },
      { name: 'token',     type: 'address'  },
      { name: 'amount',    type: 'uint256'  },
      { name: 'expiresAt', type: 'uint48'   },
    ],
    outputs: [],
  },
  {
    name: 'capture',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'txId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'release',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'txId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'expire',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'txId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'batchExpire',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'txIds', type: 'bytes32[]' }],
    outputs: [],
  },
  {
    name: 'pause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'unpause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'revokeRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // ── Read ───────────────────────────────────────────────────────────────────
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user',  type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [
      { name: 'available', type: 'uint256' },
      { name: 'locked',    type: 'uint256' },
    ],
  },
  {
    name: 'getHold',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'txId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'user',      type: 'address' },
          { name: 'merchant',  type: 'address' },
          { name: 'token',     type: 'address' },
          { name: 'amount',    type: 'uint256' },
          { name: 'createdAt', type: 'uint48'  },
          { name: 'expiresAt', type: 'uint48'  },
          { name: 'status',    type: 'uint8'   },
        ],
      },
    ],
  },
  {
    name: 'getTokenConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'allowed',  type: 'bool'  },
          { name: 'decimals', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'RELAYER_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'PAUSER_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'TOKEN_ADMIN_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'DEFAULT_ADMIN_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const
