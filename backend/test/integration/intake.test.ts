/**
 * test/integration/intake.test.ts
 * Integration tests for the full ISO 8583 intake pipeline.
 * Uses jest.unstable_mockModule for ESM compatibility.
 */
import { jest } from '@jest/globals'

const mockSubmitFn    = jest.fn()
const mockReceiptFn   = jest.fn()
const mockNormalizeFn = jest.fn()

jest.unstable_mockModule('../../src/relayer/submitter', () => ({
  submitContractCall: mockSubmitFn,
}))

jest.unstable_mockModule('../../src/relayer/responseHandler', () => ({
  waitForReceipt: mockReceiptFn,
}))

jest.unstable_mockModule('../../src/mapping/normalizer', () => ({
  normalize:              mockNormalizeFn,
  resolveUserAddress:     jest.fn(),
  resolveMerchantAddress: jest.fn(),
  resolveTokenAddress:    jest.fn(),
  _resetMaps:             jest.fn(),
}))

const { processIsoMessage } = await import('../../src/routes/intake')
const { getPaymentLog }     = await import('../../src/db/paymentLog')

const GOOD_MSG = {
  mti: '0100',
  fields: {
    '002': 'CARD_TOKEN_001', '003': '000000', '004': '000000001250',
    '007': '0603120000', '011': '123456', '012': '120000', '013': '0603',
    '037': 'RRN000000001', '042': 'TERM001', '043': 'MERCHANT001    ', '049': '840',
  },
}

const MOCK_PAYMENT = {
  txId: '0xabc', userAddress: '0x1111111111111111111111111111111111111111',
  merchantAddress: '0x2222222222222222222222222222222222222222',
  tokenAddress: '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA',
  amountWei: 1250000n, expiresAt: Math.floor(Date.now() / 1000) + 3600, isoFields: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNormalizeFn.mockReturnValue(MOCK_PAYMENT)
  mockSubmitFn.mockResolvedValue({ success: true, txHash: '0xtxhash' })
  mockReceiptFn.mockResolvedValue({ outcome: 'authorized', isoResponseCode: '00', txHash: '0xtxhash', blockNumber: 100 })
})

describe('processIsoMessage – authorize (0100)', () => {
  it('returns approved and stores submitted log', async () => {
    const result = await processIsoMessage(GOOD_MSG)
    expect(result.status).toBe('approved')
    expect(result.isoResponseCode).toBe('00')
    expect(result.action).toBe('authorize')
    expect(result.txHash).toBe('0xtxhash')
    const log = getPaymentLog(result.txId)
    expect(log).not.toBeNull()
    expect(['submitted', 'confirmed']).toContain(log.status)
  })

  it('calls submitContractCall with authorize params', async () => {
    await processIsoMessage(GOOD_MSG)
    expect(mockSubmitFn).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'authorize' }), expect.any(String))
  })
})

describe('processIsoMessage – idempotency', () => {
  it('returns duplicate on second identical message', async () => {
    await processIsoMessage(GOOD_MSG)
    const second = await processIsoMessage(GOOD_MSG)
    expect(second.status).toBe('duplicate')
    expect(second.isoResponseCode).toBe('94')
    expect(mockSubmitFn).toHaveBeenCalledTimes(1)
  })
})

describe('processIsoMessage – submission failure', () => {
  it('returns declined when submitter returns success=false', async () => {
    mockSubmitFn.mockResolvedValueOnce({
      success: false,
      classified: { code: 'INSUFFICIENT_FUNDS', isoResponseCode: '51', message: 'insufficient funds' },
      retrying: false,
    })
    const result = await processIsoMessage(GOOD_MSG)
    expect(result.status).toBe('declined')
    expect(result.isoResponseCode).toBe('51')
  })
})

describe('processIsoMessage – parse error', () => {
  it('returns declined with code 30 on bad input', async () => {
    const result = await processIsoMessage({ mti: 'XXXX', fields: {} })
    expect(result.status).toBe('declined')
    expect(result.isoResponseCode).toBe('30')
  })
})

describe('processIsoMessage – heartbeat (0800)', () => {
  it('returns approved without calling submitter', async () => {
    const result = await processIsoMessage({ ...GOOD_MSG, mti: '0800' })
    expect(result.action).toBe('heartbeat')
    expect(result.status).toBe('approved')
    expect(mockSubmitFn).not.toHaveBeenCalled()
  })
})

describe('processIsoMessage – reversal (0400)', () => {
  it('calls submitContractCall with release params', async () => {
    const msg = { ...GOOD_MSG, mti: '0400', fields: { ...GOOD_MSG.fields, '090': '123456' } }
    await processIsoMessage(msg)
    expect(mockSubmitFn).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'release' }), expect.any(String))
  })
})

describe('processIsoMessage – onchain revert', () => {
  it('returns declined when receipt shows reverted', async () => {
    mockReceiptFn.mockResolvedValueOnce({
      outcome: 'reverted', isoResponseCode: '05', txHash: '0xtxhash',
      blockNumber: 101, revertReason: 'InsufficientAvailableBalance',
    })
    const result = await processIsoMessage(GOOD_MSG)
    expect(result.status).toBe('declined')
    expect(result.isoResponseCode).toBe('05')
    expect(result.message).toBe('InsufficientAvailableBalance')
  })
})
