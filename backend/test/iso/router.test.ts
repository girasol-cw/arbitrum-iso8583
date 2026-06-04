/**
 * test/iso/router.test.ts
 * Unit tests for ISO 8583 message routing.
 */
import { routeIsoMessage } from '../../src/iso/router.js'
import type { ParsedIsoFields } from '../../src/iso/parser.js'

function makeFields(mti: string, processingCode = '000000'): ParsedIsoFields {
  return {
    mti,
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
    processingCode,
    raw: { mti, fields: {} },
  }
}

describe('routeIsoMessage', () => {
  it('routes 0100 to authorize', () => {
    expect(routeIsoMessage(makeFields('0100')).action).toBe('authorize')
  })

  it('routes 0200 with proc code 00 to capture', () => {
    expect(routeIsoMessage(makeFields('0200', '000000')).action).toBe('capture')
  })

  it('routes 0200 with proc code 28 to authorize_and_capture', () => {
    expect(routeIsoMessage(makeFields('0200', '280000')).action).toBe('authorize_and_capture')
  })

  it('routes 0400 to release', () => {
    expect(routeIsoMessage(makeFields('0400')).action).toBe('release')
  })

  it('routes 0800 to heartbeat', () => {
    expect(routeIsoMessage(makeFields('0800')).action).toBe('heartbeat')
  })

  it('routes unknown MTI to unsupported', () => {
    const result = routeIsoMessage(makeFields('0500'))
    expect(result.action).toBe('unsupported')
    expect(result.reason).toMatch(/0500/)
  })
})
