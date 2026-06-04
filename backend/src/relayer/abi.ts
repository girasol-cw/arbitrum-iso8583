/**
 * relayer/abi.ts
 * Shared ABI definition for ArbitrumSettlementCore (subset used by the relayer).
 * Mirrors ui/src/lib/abi.ts but lives inside the backend so there is no
 * cross-package import dependency at runtime.
 */
export const SETTLEMENT_ABI = [
  {
    name: 'authorize',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'txId',      type: 'bytes32' },
      { name: 'user',      type: 'address' },
      { name: 'merchant',  type: 'address' },
      { name: 'token',     type: 'address' },
      { name: 'amount',    type: 'uint256' },
      { name: 'expiresAt', type: 'uint48'  },
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
  // Events (used by response handler)
  {
    name: 'PaymentAuthorized',
    type: 'event',
    inputs: [
      { name: 'txId',      type: 'bytes32', indexed: true  },
      { name: 'user',      type: 'address', indexed: true  },
      { name: 'merchant',  type: 'address', indexed: true  },
      { name: 'token',     type: 'address', indexed: false },
      { name: 'amount',    type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PaymentCaptured',
    type: 'event',
    inputs: [
      { name: 'txId',     type: 'bytes32', indexed: true  },
      { name: 'user',     type: 'address', indexed: true  },
      { name: 'merchant', type: 'address', indexed: true  },
      { name: 'token',    type: 'address', indexed: false },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PaymentReleased',
    type: 'event',
    inputs: [
      { name: 'txId',     type: 'bytes32', indexed: true  },
      { name: 'user',     type: 'address', indexed: true  },
      { name: 'merchant', type: 'address', indexed: true  },
      { name: 'token',    type: 'address', indexed: false },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
] as const
