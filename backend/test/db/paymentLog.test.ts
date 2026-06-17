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

async function createSample(txId = SAMPLE_TX_ID) {
  await createPaymentLog({
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
  it('inserts a record successfully', async () => {
    await createSample()
    const row = await getPaymentLog(SAMPLE_TX_ID)
    expect(row).not.toBeNull()
    expect(row!.tx_id).toBe(SAMPLE_TX_ID)
    expect(row!.status).toBe('pending')
    expect(row!.action).toBe('authorize')
  })

  it('throws on duplicate txId', async () => {
    await createSample()
    await expect(createSample()).rejects.toThrow()
  })
})

describe('isDuplicate', () => {
  it('returns false when no record exists', async () => {
    expect(await isDuplicate(SAMPLE_TX_ID)).toBe(false)
  })

  it('returns true after insert', async () => {
    await createSample()
    expect(await isDuplicate(SAMPLE_TX_ID)).toBe(true)
  })
})

describe('updatePaymentStatus', () => {
  it('updates status and extra fields', async () => {
    await createSample()
    await updatePaymentStatus(SAMPLE_TX_ID, 'confirmed', {
      tx_hash: '0xtxhash',
      block_number: 42,
      onchain_status: 'authorized',
      retry_count: 1,
      last_error: 'NONCE_CONFLICT:retryable',
    })
    const row = (await getPaymentLog(SAMPLE_TX_ID))!
    expect(row.status).toBe('confirmed')
    expect(row.tx_hash).toBe('0xtxhash')
    expect(row.block_number).toBe(42)
    expect(row.onchain_status).toBe('authorized')
    expect(row.retry_count).toBe(1)
    expect(row.last_error).toBe('NONCE_CONFLICT:retryable')
  })
})

describe('listPaymentLogs', () => {
  it('returns records ordered by created_at desc', async () => {
    await createSample('0x0001' + '0'.repeat(60))
    await createSample('0x0002' + '0'.repeat(60))
    const rows = await listPaymentLogs(10, 0)
    expect(rows.length).toBe(2)
  })

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await createSample(`0x${i.toString().padStart(64, '0')}`)
    }
    expect((await listPaymentLogs(2, 0)).length).toBe(2)
    expect((await listPaymentLogs(2, 4)).length).toBe(1)
  })
})

