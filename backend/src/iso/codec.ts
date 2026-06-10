/**
 * iso/codec.ts
 * Raw ISO 8583 binary codec – encodes and decodes the binary wire format.
 *
 * Scope: authorize (0100) and capture (0200) flows only.
 *
 * Wire format (after the 2-byte TCP framing header):
 *   ┌──────────┬──────────────────┬──────────────────────┬──────────────────┐
 *   │ MTI 4B   │ Primary bitmap 8B│ Secondary bitmap 8B  │ Fields (ordered) │
 *   │ ASCII    │                  │ (only if bit 1 set)  │                  │
 *   └──────────┴──────────────────┴──────────────────────┴──────────────────┘
 *
 * Field encoding:
 *   FIXED  N  → N ASCII bytes (spaces used for right-padding if needed)
 *   LLVAR    → 2 ASCII digits (length) + data bytes
 *   LLLVAR   → 3 ASCII digits (length) + data bytes
 *
 * The 2-byte length header is NOT part of this module – see tcp/framing.ts.
 */
import type { RawIsoMessage } from './fields.js'

// ── Field spec ────────────────────────────────────────────────────────────────

type FieldSpec =
  | { kind: 'FX';  len: number }          // fixed length
  | { kind: 'LL';  max: number }          // LLVAR  (2-digit prefix)
  | { kind: 'LLL'; max: number }          // LLLVAR (3-digit prefix)

/**
 * ISO 8583:1987 field specs for the fields we handle.
 * Unknown fields that appear in a bitmap will cause a decode error.
 * This table is intentionally complete for fields 2–64 and the secondary
 * fields we care about (90) so that a well-formed message can always be parsed.
 */
const FIELD_SPECS: Record<number, FieldSpec> = {
  // ── Primary bitmap (fields 2-64) ────────────────────────────────────────────
  2:  { kind: 'LL',  max: 19  },  // PAN
  3:  { kind: 'FX',  len: 6   },  // Processing code
  4:  { kind: 'FX',  len: 12  },  // Amount
  5:  { kind: 'FX',  len: 12  },  // Settlement amount
  6:  { kind: 'FX',  len: 12  },  // Cardholder billing amount
  7:  { kind: 'FX',  len: 10  },  // Transmission DT (MMDDhhmmss)
  8:  { kind: 'FX',  len: 8   },  // Billing fee
  9:  { kind: 'FX',  len: 8   },  // Settlement conversion rate
  10: { kind: 'FX',  len: 8   },  // Billing conversion rate
  11: { kind: 'FX',  len: 6   },  // STAN
  12: { kind: 'FX',  len: 6   },  // Local time (hhmmss)
  13: { kind: 'FX',  len: 4   },  // Local date (MMDD)
  14: { kind: 'FX',  len: 4   },  // Expiry date (YYMM)
  15: { kind: 'FX',  len: 4   },  // Settlement date
  16: { kind: 'FX',  len: 4   },  // Conversion date
  17: { kind: 'FX',  len: 4   },  // Capture date
  18: { kind: 'FX',  len: 4   },  // Merchant category code
  19: { kind: 'FX',  len: 3   },  // Acquirer country code
  20: { kind: 'FX',  len: 3   },  // PAN country code
  21: { kind: 'FX',  len: 3   },  // Fwd inst country code
  22: { kind: 'FX',  len: 3   },  // POS entry mode
  23: { kind: 'FX',  len: 3   },  // Card sequence number
  24: { kind: 'FX',  len: 3   },  // Network int code
  25: { kind: 'FX',  len: 2   },  // POS condition code
  26: { kind: 'FX',  len: 2   },  // POS capture code
  27: { kind: 'FX',  len: 1   },  // Auth id response length
  28: { kind: 'FX',  len: 9   },  // Amount txn fee
  29: { kind: 'FX',  len: 9   },  // Settlement fee
  30: { kind: 'FX',  len: 9   },  // Processing fee
  31: { kind: 'FX',  len: 9   },  // Txn fee
  32: { kind: 'LL',  max: 11  },  // Acquiring inst id
  33: { kind: 'LL',  max: 11  },  // Forwarding inst id
  34: { kind: 'LL',  max: 28  },  // PAN extended
  35: { kind: 'LL',  max: 37  },  // Track 2
  36: { kind: 'LLL', max: 104 },  // Track 3
  37: { kind: 'FX',  len: 12  },  // RRN
  38: { kind: 'FX',  len: 6   },  // Auth id response
  39: { kind: 'FX',  len: 2   },  // Response code
  40: { kind: 'FX',  len: 3   },  // Service restriction code
  41: { kind: 'FX',  len: 8   },  // Card acceptor terminal id
  42: { kind: 'FX',  len: 15  },  // Card acceptor id (merchant id)
  43: { kind: 'FX',  len: 40  },  // Card acceptor name/location
  44: { kind: 'LL',  max: 25  },  // Additional response data
  45: { kind: 'LL',  max: 76  },  // Track 1
  46: { kind: 'LLL', max: 999 },  // Additional data ISO
  47: { kind: 'LLL', max: 999 },  // Additional data national
  48: { kind: 'LLL', max: 999 },  // Additional data private
  49: { kind: 'FX',  len: 3   },  // Currency code
  50: { kind: 'FX',  len: 3   },  // Settlement currency code
  51: { kind: 'FX',  len: 3   },  // Cardholder billing currency
  52: { kind: 'FX',  len: 8   },  // PIN block (binary)
  53: { kind: 'FX',  len: 16  },  // Security control info
  54: { kind: 'LLL', max: 120 },  // Additional amounts
  55: { kind: 'LLL', max: 999 },  // ICC/EMV data
  56: { kind: 'LLL', max: 999 },  // Reserved ISO
  57: { kind: 'LLL', max: 999 },  // Reserved national
  58: { kind: 'LLL', max: 999 },  // Reserved national
  59: { kind: 'LLL', max: 999 },  // Reserved national
  60: { kind: 'LLL', max: 999 },  // Reserved national
  61: { kind: 'LLL', max: 999 },  // Reserved national
  62: { kind: 'LLL', max: 999 },  // Reserved national
  63: { kind: 'LLL', max: 999 },  // Reserved national / additional data
  64: { kind: 'FX',  len: 8   },  // MAC (message authentication code)

  // ── Secondary bitmap (fields 65-128, a selection) ─────────────────────────
  65: { kind: 'FX',  len: 8   },  // Extended secondary bitmap
  90: { kind: 'FX',  len: 42  },  // Original data elements
  95: { kind: 'FX',  len: 42  },  // Replacement amounts
}

// ── Bitmap helpers ─────────────────────────────────────────────────────────────

/** Returns true if field N (1-indexed) is set in the given 8-byte bitmap buffer. */
function isBitSet(bitmap: Buffer, fieldNum: number): boolean {
  const idx  = fieldNum - 1
  const byte = Math.floor(idx / 8)
  const bit  = 7 - (idx % 8)   // MSB = bit 7 of byte 0 = field 1
  return (bitmap[byte] & (1 << bit)) !== 0
}

/** Sets field N (1-indexed) in the given 8-byte bitmap buffer. */
function setBit(bitmap: Buffer, fieldNum: number): void {
  const idx  = fieldNum - 1
  const byte = Math.floor(idx / 8)
  const bit  = 7 - (idx % 8)
  bitmap[byte] |= (1 << bit)
}

// ── Decode ─────────────────────────────────────────────────────────────────────

/**
 * Decode a raw ISO 8583 message buffer into `{ mti, fields }`.
 *
 * The buffer must NOT include the 2-byte TCP length header.
 * Field keys are zero-padded 3-digit strings ("002", "011", …).
 *
 * Throws if:
 * - The buffer is too short for the MTI + primary bitmap
 * - An unknown field number is present in the bitmap
 * - A LLVAR/LLLVAR field exceeds its declared max length
 */
export function decodeIso8583(buf: Buffer): RawIsoMessage {
  if (buf.length < 12) {
    throw new Error(`ISO 8583 decode: buffer too short (${buf.length} bytes, need at least 12)`)
  }

  let offset = 0

  // 1. MTI – 4 ASCII bytes
  const mti = buf.subarray(offset, offset + 4).toString('ascii')
  offset += 4

  // 2. Primary bitmap – 8 bytes
  const primaryBitmap = Buffer.from(buf.subarray(offset, offset + 8))
  offset += 8

  // 3. Secondary bitmap (optional) – indicated by bit 1 of primary bitmap
  const hasSecondary = isBitSet(primaryBitmap, 1)
  let secondaryBitmap: Buffer | null = null

  if (hasSecondary) {
    if (buf.length < offset + 8) {
      throw new Error('ISO 8583 decode: secondary bitmap expected but buffer too short')
    }
    secondaryBitmap = Buffer.from(buf.subarray(offset, offset + 8))
    offset += 8
  }

  // 4. Collect present field numbers (skip field 1 – secondary bitmap indicator)
  const presentFields: number[] = []

  for (let f = 2; f <= 64; f++) {
    if (isBitSet(primaryBitmap, f)) presentFields.push(f)
  }

  if (hasSecondary && secondaryBitmap) {
    for (let f = 65; f <= 128; f++) {
      if (isBitSet(secondaryBitmap, f - 64)) presentFields.push(f)
    }
  }

  // 5. Read each field in order
  const fields: Record<string, string> = {}

  for (const fieldNum of presentFields) {
    const spec = FIELD_SPECS[fieldNum]
    if (!spec) {
      throw new Error(
        `ISO 8583 decode: field ${fieldNum} present in bitmap but no spec defined. ` +
        `Add it to FIELD_SPECS in codec.ts.`
      )
    }

    if (spec.kind === 'FX') {
      if (buf.length < offset + spec.len) {
        throw new Error(`ISO 8583 decode: buffer too short reading fixed field ${fieldNum}`)
      }
      const raw = buf.subarray(offset, offset + spec.len).toString('ascii')
      fields[String(fieldNum).padStart(3, '0')] = raw.trimEnd()
      offset += spec.len

    } else if (spec.kind === 'LL') {
      if (buf.length < offset + 2) {
        throw new Error(`ISO 8583 decode: buffer too short reading LLVAR length for field ${fieldNum}`)
      }
      const lenStr = buf.subarray(offset, offset + 2).toString('ascii')
      const len = parseInt(lenStr, 10)
      if (isNaN(len) || len > spec.max) {
        throw new Error(`ISO 8583 decode: invalid LLVAR length "${lenStr}" for field ${fieldNum} (max ${spec.max})`)
      }
      offset += 2
      if (buf.length < offset + len) {
        throw new Error(`ISO 8583 decode: buffer too short reading LLVAR data for field ${fieldNum}`)
      }
      fields[String(fieldNum).padStart(3, '0')] = buf.subarray(offset, offset + len).toString('ascii')
      offset += len

    } else {
      // LLLVAR
      if (buf.length < offset + 3) {
        throw new Error(`ISO 8583 decode: buffer too short reading LLLVAR length for field ${fieldNum}`)
      }
      const lenStr = buf.subarray(offset, offset + 3).toString('ascii')
      const len = parseInt(lenStr, 10)
      if (isNaN(len) || len > spec.max) {
        throw new Error(`ISO 8583 decode: invalid LLLVAR length "${lenStr}" for field ${fieldNum} (max ${spec.max})`)
      }
      offset += 3
      if (buf.length < offset + len) {
        throw new Error(`ISO 8583 decode: buffer too short reading LLLVAR data for field ${fieldNum}`)
      }
      fields[String(fieldNum).padStart(3, '0')] = buf.subarray(offset, offset + len).toString('ascii')
      offset += len
    }
  }

  return { mti, fields }
}

// ── Encode ─────────────────────────────────────────────────────────────────────

/**
 * Encode a `{ mti, fields }` object into a raw ISO 8583 binary buffer.
 *
 * The output does NOT include the 2-byte TCP length header – wrap with
 * `encodeWithLengthHeader` or let framing.ts add it.
 *
 * Field keys are zero-padded 3-digit strings or plain numeric strings.
 * FIXED fields are right-padded with spaces if the value is shorter.
 *
 * Throws if:
 * - A field has no spec
 * - A variable-length field exceeds its max
 */
export function encodeIso8583(msg: RawIsoMessage): Buffer {
  // Normalise keys to integers and sort ascending
  const fieldEntries = Object.entries(msg.fields)
    .map(([k, v]) => [parseInt(k, 10), v ?? ''] as [number, string])
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a - b)

  // Build bitmaps
  const primaryBitmap   = Buffer.alloc(8, 0)
  const secondaryBitmap = Buffer.alloc(8, 0)
  let hasSecondary = false

  for (const [fieldNum] of fieldEntries) {
    if (fieldNum >= 65) {
      hasSecondary = true
      setBit(secondaryBitmap, fieldNum - 64)
    } else if (fieldNum >= 2) {
      setBit(primaryBitmap, fieldNum)
    }
  }

  if (hasSecondary) setBit(primaryBitmap, 1) // indicate secondary bitmap

  // Build field data
  const parts: Buffer[] = []

  // MTI
  parts.push(Buffer.from(msg.mti, 'ascii'))

  // Bitmaps
  parts.push(primaryBitmap)
  if (hasSecondary) parts.push(secondaryBitmap)

  // Fields
  for (const [fieldNum, value] of fieldEntries) {
    const spec = FIELD_SPECS[fieldNum]
    if (!spec) {
      throw new Error(
        `ISO 8583 encode: field ${fieldNum} has no spec defined in codec.ts`
      )
    }

    if (spec.kind === 'FX') {
      // Right-pad with spaces to exact length
      const padded = value.substring(0, spec.len).padEnd(spec.len, ' ')
      parts.push(Buffer.from(padded, 'ascii'))

    } else if (spec.kind === 'LL') {
      if (value.length > spec.max) {
        throw new Error(`ISO 8583 encode: field ${fieldNum} value length ${value.length} exceeds max ${spec.max}`)
      }
      const lenStr = String(value.length).padStart(2, '0')
      parts.push(Buffer.from(lenStr + value, 'ascii'))

    } else {
      if (value.length > spec.max) {
        throw new Error(`ISO 8583 encode: field ${fieldNum} value length ${value.length} exceeds max ${spec.max}`)
      }
      const lenStr = String(value.length).padStart(3, '0')
      parts.push(Buffer.from(lenStr + value, 'ascii'))
    }
  }

  return Buffer.concat(parts)
}

/**
 * Encode with a 2-byte big-endian length header (same as TCP framing).
 * Equivalent to: `framing.wrap(encodeIso8583(msg))`.
 */
export function encodeWithLengthHeader(msg: RawIsoMessage): Buffer {
  const body = encodeIso8583(msg)
  const header = Buffer.alloc(2)
  header.writeUInt16BE(body.length, 0)
  return Buffer.concat([header, body])
}
