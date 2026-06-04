/**
 * test/iso/parser.test.ts
 * Unit tests for the ISO 8583 parser.
 */
import { parseIsoMessage } from '../../src/iso/parser.js'

const BASE_MSG = {
  mti: '0100',
  fields: {
    '002': '4111111111111111',
    '003': '000000',
    '004': '000000001250',  // $12.50
    '007': '0603120000',
    '011': '123456',
    '012': '120000',
    '013': '0603',
    '037': 'RRN000000001',
    '042': 'TERM001',
    '043': 'MERCHANT001    ',
    '049': '840',
  },
}

describe('parseIsoMessage', () => {
  it('parses a valid 0100 message', () => {
    const result = parseIsoMessage(BASE_MSG)
    expect(result.mti).toBe('0100')
    expect(result.stan).toBe('123456')
    expect(result.rrn).toBe('RRN000000001')
    expect(result.amountDecimal).toBe('12.50')
    expect(result.currencyNumeric).toBe('840')
    expect(result.currencyAlpha).toBe('USD')
    expect(result.cardToken).toBe('4111111111111111')
    expect(result.terminalId).toBe('TERM001')
    expect(result.merchantRef).toBe('MERCHANT001')
  })

  it('throws when MTI is missing', () => {
    expect(() => parseIsoMessage({ ...BASE_MSG, mti: '' })).toThrow()
  })

  it('throws when MTI is not 4 digits', () => {
    expect(() => parseIsoMessage({ ...BASE_MSG, mti: 'ABC1' })).toThrow(/MTI/)
  })

  it('throws when a required field is missing', () => {
    const msg = { ...BASE_MSG, fields: { ...BASE_MSG.fields } }
    delete (msg.fields as Record<string, string | undefined>)['011']
    expect(() => parseIsoMessage(msg)).toThrow(/STAN/)
  })

  it('correctly converts amount with leading zeros', () => {
    const msg = {
      ...BASE_MSG,
      fields: { ...BASE_MSG.fields, '004': '000000100000' }, // $1000.00
    }
    const result = parseIsoMessage(msg)
    expect(result.amountDecimal).toBe('1000.00')
  })

  it('handles unknown currency as pass-through', () => {
    const msg = {
      ...BASE_MSG,
      fields: { ...BASE_MSG.fields, '049': '999' },
    }
    const result = parseIsoMessage(msg)
    expect(result.currencyAlpha).toBe('999')
  })
})
