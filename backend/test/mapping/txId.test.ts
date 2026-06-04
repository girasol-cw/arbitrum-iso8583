/**
 * test/mapping/txId.test.ts
 * Unit tests for deterministic txId derivation.
 */
import { deriveTxId, deriveReversalTxId } from '../../src/mapping/txId.js'
import type { ParsedIsoFields } from '../../src/iso/parser.js'

function makeFields(overrides: Partial<ParsedIsoFields> = {}): ParsedIsoFields {
  return {
    mti: '0100',
    stan: '123456',
    rrn: 'RRN000000001',
    amountDecimal: '12.50',
    currencyNumeric: '840',
    currencyAlpha: 'USD',
    cardToken: '4111111111111111',
    terminalId: 'TERM001',
    merchantRef: 'MERCHANT001',
    additionalRef: '',
    transmissionDt: '0603120000',
    localDate: '0603',
    localTime: '120000',
    processingCode: '000000',
    raw: { mti: '0100', fields: {} },
    ...overrides,
  }
}

describe('deriveTxId', () => {
  it('returns a 0x-prefixed 32-byte hex string', () => {
    const txId = deriveTxId(makeFields())
    expect(txId).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is deterministic for the same inputs', () => {
    const a = deriveTxId(makeFields())
    const b = deriveTxId(makeFields())
    expect(a).toBe(b)
  })

  it('differs when STAN changes', () => {
    const a = deriveTxId(makeFields({ stan: '111111' }))
    const b = deriveTxId(makeFields({ stan: '222222' }))
    expect(a).not.toBe(b)
  })

  it('differs when RRN changes', () => {
    const a = deriveTxId(makeFields({ rrn: 'RRN000000001' }))
    const b = deriveTxId(makeFields({ rrn: 'RRN000000002' }))
    expect(a).not.toBe(b)
  })

  it('differs when merchantRef changes', () => {
    const a = deriveTxId(makeFields({ merchantRef: 'MERCHANT001' }))
    const b = deriveTxId(makeFields({ merchantRef: 'MERCHANT002' }))
    expect(a).not.toBe(b)
  })
})

describe('deriveReversalTxId', () => {
  it('uses originalStan when present', () => {
    const original  = deriveTxId(makeFields({ stan: 'ORIG01' }))
    const reversal  = deriveReversalTxId(makeFields({ stan: 'REV001', originalStan: 'ORIG01' }))
    expect(reversal).toBe(original)
  })

  it('falls back to normal derivation when no originalStan', () => {
    const normal   = deriveTxId(makeFields({ stan: 'ABC123' }))
    const reversal = deriveReversalTxId(makeFields({ stan: 'ABC123' }))
    expect(reversal).toBe(normal)
  })
})
