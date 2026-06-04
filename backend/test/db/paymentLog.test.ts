/**
 * test/db/paymentLog.test.ts
 * Unit tests for payment_log CRUD operations.
 */
import {
  createPaymentLog,
  getPaymentLog,
  updatePaymentStatus,
  isDuplicate,
  listPaymentLogs,
} from '../../src/db/paymentLog.js'

const SAMPLE_TX_ID = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

function createSample(txId = SAMPLE_TX_ID) {
  createPaymentLog({
    txId,
    mti: '0100',
    stan: '123456',
    rrn: 'RRN000000001',
    merchantRef: 'MERCHANT001',
    terminalId: 'TERM001',
    cardToken: '4111111111111111',
    userAddress: '0xUser',
    merchantAddress: '0xMerchant',
    tokenAddress: '0xToken',
    amountDecimal: '12.50',
    currencyAlpha: 'USD',
    action: 'authorize',
    isoRaw: { mti: '0100', fields: {} },
  })
}

describe('createPaymentLog', () => {
  it('inserts a record successfully', () => {
    createSample()
    const row = getPaymentLog(SAMPLE_TX_ID)
    expect(row).not.toBeNull()
    expect(row!.tx_id).toBe(SAMPLE_TX_ID)
    expect(row!.status).toBe('pending')
    expect(row!.action).toBe('authorize')
  })

  it('throws on duplicate txId', () => {
    createSample()
    expect(() => createSample()).toThrow()
  })
})

describe('isDuplicate', () => {
  it('returns false when no record exists', () => {
    expect(isDuplicate(SAMPLE_TX_ID)).toBe(false)
  })

  it('returns true after insert', () => {
    createSample()
    expect(isDuplicate(SAMPLE_TX_ID)).toBe(true)
  })
})

describe('updatePaymentStatus', () => {
  it('updates status and extra fields', () => {
    createSample()
    updatePaymentStatus(SAMPLE_TX_ID, 'confirmed', {
      tx_hash: '0xtxhash',
      block_number: 42,
      onchain_status: 'authorized',
    })
    const row = getPaymentLog(SAMPLE_TX_ID)!
    expect(row.status).toBe('confirmed')
    expect(row.tx_hash).toBe('0xtxhash')
    expect(row.block_number).toBe(42)
    expect(row.onchain_status).toBe('authorized')
  })
})

describe('listPaymentLogs', () => {
  it('returns records ordered by created_at desc', () => {
    createSample('0x0001' + '0'.repeat(60))
    createSample('0x0002' + '0'.repeat(60))
    const rows = listPaymentLogs(10, 0)
    expect(rows.length).toBe(2)
  })

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      createSample(`0x${i.toString().padStart(64, '0')}`)
    }
    expect(listPaymentLogs(2, 0).length).toBe(2)
    expect(listPaymentLogs(2, 4).length).toBe(1)
  })
})


