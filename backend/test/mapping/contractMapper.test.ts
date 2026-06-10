/**
 * test/mapping/contractMapper.test.ts
 * Unit tests for normalized payment -> ABI call mapping.
 */
import {
  buildAuthorizeCall,
  buildCaptureCall,
  buildReleaseCall,
} from '../../src/mapping/contractMapper.js'
import type { PaymentMessage } from '../../src/mapping/normalizer.js'

const TX_ID = '0x' + 'a'.repeat(64) as `0x${string}`

const PAYMENT: PaymentMessage = {
  txId: TX_ID,
  userAddress: '0x1111111111111111111111111111111111111111',
  merchantAddress: '0x2222222222222222222222222222222222222222',
  tokenAddress: '0x3333333333333333333333333333333333333333',
  amountWei: 1250000n,
  expiresAt: 1717358400,
  isoFields: null as never,
}

describe('contractMapper', () => {
  it('maps PaymentMessage to authorize ABI params in contract order', () => {
    expect(buildAuthorizeCall(PAYMENT)).toEqual({
      functionName: 'authorize',
      args: [
        PAYMENT.txId,
        PAYMENT.userAddress,
        PAYMENT.merchantAddress,
        PAYMENT.tokenAddress,
        PAYMENT.amountWei,
        PAYMENT.expiresAt,
      ],
    })
  })

  it('maps txId to capture ABI params', () => {
    expect(buildCaptureCall(TX_ID)).toEqual({
      functionName: 'capture',
      args: [TX_ID],
    })
  })

  it('maps txId to release ABI params', () => {
    expect(buildReleaseCall(TX_ID)).toEqual({
      functionName: 'release',
      args: [TX_ID],
    })
  })
})
