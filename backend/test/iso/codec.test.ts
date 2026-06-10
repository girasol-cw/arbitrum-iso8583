/**
 * test/iso/codec.test.ts
 * Unit tests for iso/codec.ts – encode/decode roundtrip and edge cases.
 */
import { decodeIso8583, encodeIso8583, encodeWithLengthHeader } from '../../src/iso/codec.js'
import type { RawIsoMessage } from '../../src/iso/fields.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal authorization request message (0100). */
function authRequestMsg(): RawIsoMessage {
  return {
    mti: '0100',
    fields: {
      '002': '4111111111111111',      // PAN (LLVAR)
      '003': '000000',                // Processing code (FIXED 6)
      '004': '000000001250',          // Amount 12.50 (FIXED 12)
      '011': '123456',                // STAN (FIXED 6)
      '037': 'RRN000000001',          // RRN (FIXED 12)
      '042': 'MERCHANT001    ',       // Merchant ID (FIXED 15)
      '043': 'Test Merchant Name' + ' '.repeat(22),  // Name (FIXED 40)
      '049': '840',                   // Currency USD (FIXED 3)
    },
  }
}

/** Build a minimal capture request (0200). */
function captureRequestMsg(): RawIsoMessage {
  return {
    mti: '0200',
    fields: {
      '002': '5500000000000004',
      '003': '000000',
      '004': '000000005000',
      '011': '654321',
      '037': 'RRN000000002',
      '042': 'TERM001        ',
      '043': 'Another Store'.padEnd(40, ' '),
      '049': '840',
    },
  }
}

// ── Encode/Decode roundtrip ───────────────────────────────────────────────────

describe('encodeIso8583 + decodeIso8583 roundtrip', () => {
  it('auth request (0100) roundtrips cleanly', () => {
    const original = authRequestMsg()
    const encoded  = encodeIso8583(original)
    const decoded  = decodeIso8583(encoded)

    expect(decoded.mti).toBe('0100')
    expect(decoded.fields['002']).toBe('4111111111111111')
    expect(decoded.fields['003']).toBe('000000')
    expect(decoded.fields['004']).toBe('000000001250')
    expect(decoded.fields['011']).toBe('123456')
    expect(decoded.fields['037']).toBe('RRN000000001')
    expect(decoded.fields['049']).toBe('840')
  })

  it('capture request (0200) roundtrips cleanly', () => {
    const original = captureRequestMsg()
    const encoded  = encodeIso8583(original)
    const decoded  = decodeIso8583(encoded)

    expect(decoded.mti).toBe('0200')
    expect(decoded.fields['011']).toBe('654321')
    expect(decoded.fields['037']).toBe('RRN000000002')
  })

  it('all field values survive the roundtrip', () => {
    const msg: RawIsoMessage = {
      mti: '0100',
      fields: {
        '002': '9999888877776666',   // LLVAR PAN
        '003': '280000',             // Processing code
        '004': '000000010000',       // Amount
        '007': '0609143000',         // Transmission DT
        '011': '000042',             // STAN
        '012': '143000',             // Local time
        '013': '0609',               // Local date
        '037': '000000000042',       // RRN
        '042': 'TERM42         ',    // Terminal ID
        '043': 'ACME Corp'.padEnd(40, ' '), // Merchant name
        '049': '978',                // EUR
      },
    }
    const decoded = decodeIso8583(encodeIso8583(msg))

    expect(decoded.mti).toBe('0100')
    expect(decoded.fields['002']).toBe('9999888877776666')
    expect(decoded.fields['007']).toBe('0609143000')
    expect(decoded.fields['013']).toBe('0609')
    expect(decoded.fields['049']).toBe('978')
  })
})

// ── Bitmap ────────────────────────────────────────────────────────────────────

describe('bitmap encoding', () => {
  it('only sets bits for present fields', () => {
    const msg: RawIsoMessage = { mti: '0100', fields: { '011': '000001', '037': 'RRN000000000' } }
    const encoded = encodeIso8583(msg)

    // Primary bitmap starts at byte 4 (after 4-byte MTI)
    const bitmap = encoded.subarray(4, 12)

    // Field 11 → bit index 10 (0-indexed) → byte 1, bit position 2 from MSB
    //   byte = floor(10/8) = 1, bit = 7 - (10%8) = 7 - 2 = 5 → mask 0x20
    expect(bitmap[1] & 0x20).not.toBe(0)  // field 11

    // Field 37 → bit index 36 → byte 4, bit position 7-(36%8)=7-4=3 → mask 0x08
    expect(bitmap[4] & 0x08).not.toBe(0)  // field 37

    // Fields 2,3,4 not set → byte 0 should only reflect field 11's byte
    expect(bitmap[0]).toBe(0)
  })

  it('sets secondary bitmap indicator when field ≥ 65 is present', () => {
    const msg: RawIsoMessage = {
      mti: '0100',
      fields: {
        '011': '000001',
        '090': '000000000000000000000000000000000000000000', // FIXED 42
      },
    }
    const encoded = encodeIso8583(msg)
    const primaryBitmap = encoded.subarray(4, 12)

    // Bit 1 of primary bitmap (MSB of byte 0) should be set
    expect(primaryBitmap[0] & 0x80).not.toBe(0)
  })
})

// ── Length header ─────────────────────────────────────────────────────────────

describe('encodeWithLengthHeader', () => {
  it('prepends correct 2-byte big-endian length', () => {
    const msg = authRequestMsg()
    const withHeader = encodeWithLengthHeader(msg)
    const bodyLen = withHeader.readUInt16BE(0)
    const body = withHeader.subarray(2)

    expect(body.length).toBe(bodyLen)
  })

  it('decoded body equals decoded body without header', () => {
    const msg = authRequestMsg()
    const withHeader = encodeWithLengthHeader(msg)
    const bodyLen = withHeader.readUInt16BE(0)
    const body = withHeader.subarray(2, 2 + bodyLen)

    const decoded = decodeIso8583(body)
    expect(decoded.mti).toBe(msg.mti)
    expect(decoded.fields['011']).toBe(msg.fields['011'])
  })
})

// ── Error cases ───────────────────────────────────────────────────────────────

describe('decodeIso8583 error handling', () => {
  it('throws on buffer too short', () => {
    expect(() => decodeIso8583(Buffer.from('0100', 'ascii'))).toThrow(/too short/)
  })

  it('throws on unknown field in bitmap', () => {
    // Build a message with field 99 set (not in FIELD_SPECS for secondary)
    // by manipulating the raw bitmap
    const msg: RawIsoMessage = { mti: '0100', fields: { '011': '000001' } }
    const encoded = encodeIso8583(msg)

    // Manually set bit for field 128 (last bit of secondary bitmap)
    // First, set bit 1 of primary (enable secondary)
    encoded[4] |= 0x80
    // Add 8 zero bytes for secondary bitmap – but we need to inject them
    // so this test just verifies the unknown field error path via field 128
    const withSec = Buffer.concat([
      encoded.subarray(0, 12),
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]), // field 128 set
      encoded.subarray(12),
    ])
    expect(() => decodeIso8583(withSec)).toThrow(/no spec defined/)
  })
})

describe('encodeIso8583 error handling', () => {
  it('throws on LLVAR value exceeding max length', () => {
    const msg: RawIsoMessage = {
      mti: '0100',
      fields: { '002': '1'.repeat(20) }, // max is 19
    }
    expect(() => encodeIso8583(msg)).toThrow(/exceeds max/)
  })
})
