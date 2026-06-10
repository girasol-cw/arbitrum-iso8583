/**
 * posCodec.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT / TESTING USE ONLY — NOT FOR PRODUCTION                       ║
 * ║                                                                             ║
 * ║  This module is the browser-side mirror of backend/src/iso/codec.ts.       ║
 * ║  It encodes and decodes the same binary ISO 8583 wire format so the UI     ║
 * ║  can impersonate a real POS terminal when talking to the backend over the   ║
 * ║  WebSocket ↔ TCP bridge at /ws/pos.                                        ║
 * ║                                                                             ║
 * ║  A real POS device would:                                                   ║
 * ║    1. Open a raw TCP socket to :5000                                        ║
 * ║    2. Send binary ISO 8583 frames (2-byte length header + body)             ║
 * ║    3. Read binary response frames from the server                           ║
 * ║                                                                             ║
 * ║  This module does the same encoding/decoding entirely in the browser so     ║
 * ║  the UI can replay the full wire protocol end-to-end.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Wire format (after the 2-byte TCP framing header):
 *   ┌──────────┬──────────────────┬──────────────────────┬──────────────────┐
 *   │ MTI 4B   │ Primary bitmap 8B│ Secondary bitmap 8B  │ Fields (ordered) │
 *   │ ASCII    │                  │ (only if bit 1 set)  │                  │
 *   └──────────┴──────────────────┴──────────────────────┴──────────────────┘
 *
 * Framed packet:
 *   ┌──────────────────┬────────────────────────────────────┐
 *   │ Length  2 bytes  │  Message body  (MTI + bitmap + …)  │
 *   │ Big-endian uint16│                                    │
 *   └──────────────────┴────────────────────────────────────┘
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawIsoMessage {
  mti:    string
  fields: Record<string, string>
}

type FieldSpec =
  | { kind: 'FX';  len: number }
  | { kind: 'LL';  max: number }
  | { kind: 'LLL'; max: number }

// ── Field spec table (mirrors backend/src/iso/codec.ts exactly) ───────────────
// Any deviation here will cause encode/decode mismatches with the server.

const FIELD_SPECS: Record<number, FieldSpec> = {
  2:  { kind: 'LL',  max: 19  },
  3:  { kind: 'FX',  len: 6   },
  4:  { kind: 'FX',  len: 12  },
  5:  { kind: 'FX',  len: 12  },
  6:  { kind: 'FX',  len: 12  },
  7:  { kind: 'FX',  len: 10  },
  8:  { kind: 'FX',  len: 8   },
  9:  { kind: 'FX',  len: 8   },
  10: { kind: 'FX',  len: 8   },
  11: { kind: 'FX',  len: 6   },
  12: { kind: 'FX',  len: 6   },
  13: { kind: 'FX',  len: 4   },
  14: { kind: 'FX',  len: 4   },
  15: { kind: 'FX',  len: 4   },
  16: { kind: 'FX',  len: 4   },
  17: { kind: 'FX',  len: 4   },
  18: { kind: 'FX',  len: 4   },
  19: { kind: 'FX',  len: 3   },
  20: { kind: 'FX',  len: 3   },
  21: { kind: 'FX',  len: 3   },
  22: { kind: 'FX',  len: 3   },
  23: { kind: 'FX',  len: 3   },
  24: { kind: 'FX',  len: 3   },
  25: { kind: 'FX',  len: 2   },
  26: { kind: 'FX',  len: 2   },
  27: { kind: 'FX',  len: 1   },
  28: { kind: 'FX',  len: 9   },
  29: { kind: 'FX',  len: 9   },
  30: { kind: 'FX',  len: 9   },
  31: { kind: 'FX',  len: 9   },
  32: { kind: 'LL',  max: 11  },
  33: { kind: 'LL',  max: 11  },
  34: { kind: 'LL',  max: 28  },
  35: { kind: 'LL',  max: 37  },
  36: { kind: 'LLL', max: 104 },
  37: { kind: 'FX',  len: 12  },
  38: { kind: 'FX',  len: 6   },
  39: { kind: 'FX',  len: 2   },
  40: { kind: 'FX',  len: 3   },
  41: { kind: 'FX',  len: 8   },
  42: { kind: 'FX',  len: 15  },
  43: { kind: 'FX',  len: 40  },
  44: { kind: 'LL',  max: 25  },
  45: { kind: 'LL',  max: 76  },
  46: { kind: 'LLL', max: 999 },
  47: { kind: 'LLL', max: 999 },
  48: { kind: 'LLL', max: 999 },
  49: { kind: 'FX',  len: 3   },
  50: { kind: 'FX',  len: 3   },
  51: { kind: 'FX',  len: 3   },
  52: { kind: 'FX',  len: 8   },
  53: { kind: 'FX',  len: 16  },
  54: { kind: 'LLL', max: 120 },
  55: { kind: 'LLL', max: 999 },
  56: { kind: 'LLL', max: 999 },
  57: { kind: 'LLL', max: 999 },
  58: { kind: 'LLL', max: 999 },
  59: { kind: 'LLL', max: 999 },
  60: { kind: 'LLL', max: 999 },
  61: { kind: 'LLL', max: 999 },
  62: { kind: 'LLL', max: 999 },
  63: { kind: 'LLL', max: 999 },
  64: { kind: 'FX',  len: 8   },
  65: { kind: 'FX',  len: 8   },
  90: { kind: 'FX',  len: 42  },
  95: { kind: 'FX',  len: 42  },
}

// ── Bitmap helpers ─────────────────────────────────────────────────────────────

function isBitSet(bitmap: Uint8Array, fieldNum: number): boolean {
  const idx  = fieldNum - 1
  const byte = Math.floor(idx / 8)
  const bit  = 7 - (idx % 8)
  return (bitmap[byte] & (1 << bit)) !== 0
}

function setBit(bitmap: Uint8Array, fieldNum: number): void {
  const idx  = fieldNum - 1
  const byte = Math.floor(idx / 8)
  const bit  = 7 - (idx % 8)
  bitmap[byte] |= (1 << bit)
}

// ── Text helpers ───────────────────────────────────────────────────────────────

const ENC = new TextEncoder()
const DEC = new TextDecoder('ascii')

function ascii(s: string): Uint8Array { return ENC.encode(s) }
function fromAscii(buf: Uint8Array, start: number, len: number): string {
  return DEC.decode(buf.subarray(start, start + len))
}

// ── Encode ─────────────────────────────────────────────────────────────────────

/**
 * Encode a `{ mti, fields }` object into the raw ISO 8583 binary body.
 * Does NOT include the 2-byte length header – use `encodeFramed` for that.
 *
 * Mirrors `encodeIso8583` in backend/src/iso/codec.ts exactly.
 */
export function encodeIso8583(msg: RawIsoMessage): Uint8Array {
  const fieldEntries = Object.entries(msg.fields)
    .map(([k, v]) => [parseInt(k, 10), v ?? ''] as [number, string])
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a - b)

  const primaryBitmap   = new Uint8Array(8)
  const secondaryBitmap = new Uint8Array(8)
  let hasSecondary = false

  for (const [fieldNum] of fieldEntries) {
    if (fieldNum >= 65) {
      hasSecondary = true
      setBit(secondaryBitmap, fieldNum - 64)
    } else if (fieldNum >= 2) {
      setBit(primaryBitmap, fieldNum)
    }
  }
  if (hasSecondary) setBit(primaryBitmap, 1)

  const parts: Uint8Array[] = []

  parts.push(ascii(msg.mti))
  parts.push(primaryBitmap)
  if (hasSecondary) parts.push(secondaryBitmap)

  for (const [fieldNum, value] of fieldEntries) {
    const spec = FIELD_SPECS[fieldNum]
    if (!spec) throw new Error(`posCodec: field ${fieldNum} has no spec`)

    if (spec.kind === 'FX') {
      parts.push(ascii(value.substring(0, spec.len).padEnd(spec.len, ' ')))
    } else if (spec.kind === 'LL') {
      if (value.length > spec.max) throw new Error(`posCodec: field ${fieldNum} exceeds max ${spec.max}`)
      parts.push(ascii(String(value.length).padStart(2, '0') + value))
    } else {
      if (value.length > spec.max) throw new Error(`posCodec: field ${fieldNum} exceeds max ${spec.max}`)
      parts.push(ascii(String(value.length).padStart(3, '0') + value))
    }
  }

  const total = parts.reduce((s, p) => s + p.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

/**
 * Encode a message and prepend the 2-byte big-endian length header.
 * This is what gets sent over the WebSocket (and what a real POS would send
 * over TCP).
 */
export function encodeFramed(msg: RawIsoMessage): Uint8Array {
  const body   = encodeIso8583(msg)
  const framed = new Uint8Array(2 + body.length)
  const view   = new DataView(framed.buffer)
  view.setUint16(0, body.length, false /* big-endian */)
  framed.set(body, 2)
  return framed
}

// ── Decode ─────────────────────────────────────────────────────────────────────

/**
 * Decode a raw ISO 8583 body (WITHOUT the 2-byte length header) into
 * `{ mti, fields }`.
 *
 * Mirrors `decodeIso8583` in backend/src/iso/codec.ts exactly.
 */
export function decodeIso8583(buf: Uint8Array): RawIsoMessage {
  if (buf.length < 12) throw new Error(`posCodec: buffer too short (${buf.length})`)

  let offset = 0

  const mti = fromAscii(buf, offset, 4); offset += 4

  const primaryBitmap = buf.slice(offset, offset + 8); offset += 8

  const hasSecondary = isBitSet(primaryBitmap, 1)
  let secondaryBitmap: Uint8Array | null = null
  if (hasSecondary) {
    if (buf.length < offset + 8) throw new Error('posCodec: secondary bitmap missing')
    secondaryBitmap = buf.slice(offset, offset + 8); offset += 8
  }

  const presentFields: number[] = []
  for (let f = 2; f <= 64; f++) if (isBitSet(primaryBitmap, f)) presentFields.push(f)
  if (hasSecondary && secondaryBitmap) {
    for (let f = 65; f <= 128; f++) if (isBitSet(secondaryBitmap, f - 64)) presentFields.push(f)
  }

  const fields: Record<string, string> = {}

  for (const fieldNum of presentFields) {
    const spec = FIELD_SPECS[fieldNum]
    if (!spec) throw new Error(`posCodec: unknown field ${fieldNum}`)

    if (spec.kind === 'FX') {
      fields[String(fieldNum).padStart(3, '0')] = fromAscii(buf, offset, spec.len).trimEnd()
      offset += spec.len
    } else if (spec.kind === 'LL') {
      const len = parseInt(fromAscii(buf, offset, 2), 10); offset += 2
      fields[String(fieldNum).padStart(3, '0')] = fromAscii(buf, offset, len); offset += len
    } else {
      const len = parseInt(fromAscii(buf, offset, 3), 10); offset += 3
      fields[String(fieldNum).padStart(3, '0')] = fromAscii(buf, offset, len); offset += len
    }
  }

  return { mti, fields }
}

/**
 * Decode a framed response (with the 2-byte length header).
 * Returns null if the buffer is incomplete (still accumulating chunks).
 */
export function decodeFramed(buf: Uint8Array): { msg: RawIsoMessage; consumed: number } | null {
  if (buf.length < 2) return null
  const view    = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const bodyLen = view.getUint16(0, false /* big-endian */)
  if (buf.length < 2 + bodyLen) return null
  const msg = decodeIso8583(buf.slice(2, 2 + bodyLen))
  return { msg, consumed: 2 + bodyLen }
}

// ── Message builders (POS-side) ───────────────────────────────────────────────

/** Generates a random 6-digit STAN – mimics what real POS firmware does. */
export function randomStan(): string {
  return String(Math.floor(Math.random() * 999_999)).padStart(6, '0')
}

/** Generates a random 12-char RRN. */
export function randomRrn(): string {
  return Array.from({ length: 12 }, () =>
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)],
  ).join('')
}

/** Formats an amount as a 12-digit ISO 8583 field (major units × 100). */
export function fmtAmount(major: string | number): string {
  return String(Math.round(Number(major) * 100)).padStart(12, '0')
}

/** Current MMDDhhmmss transmission timestamp. */
export function nowTransmissionDt(): string {
  const d   = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

/**
 * Build an authorization request (0100) exactly as a POS terminal would.
 *
 * A real POS would populate these fields from its keypad (amount), card reader
 * (PAN), and configuration (merchant/terminal IDs).  Here we supply them from
 * the UI form.
 */
export function buildPosAuthorize(opts: {
  cardToken:   string
  merchantRef: string
  terminalId:  string
  amount:      string | number
  currency?:   string
}): RawIsoMessage {
  const stan = randomStan()
  const rrn  = randomRrn()
  const now  = nowTransmissionDt()
  return {
    mti: '0100',
    fields: {
      '002': opts.cardToken,
      '003': '000000',
      '004': fmtAmount(opts.amount),
      '007': now,
      '011': stan,
      '012': now.slice(4),          // hhmmss
      '013': now.slice(0, 4),       // MMDD
      '037': rrn,
      '042': opts.terminalId.substring(0, 15).padEnd(15, ' '),
      '043': opts.merchantRef.substring(0, 40).padEnd(40, ' '),
      '049': opts.currency ?? '840',
    },
  }
}

/**
 * Build a capture / financial request (0200) after a prior authorization.
 * The `originalStan` should match the STAN from the 0100 that was approved.
 */
export function buildPosCapture(opts: {
  cardToken:    string
  merchantRef:  string
  terminalId:   string
  amount:       string | number
  originalStan: string
  currency?:    string
}): RawIsoMessage {
  const base = buildPosAuthorize(opts)
  return {
    mti: '0200',
    fields: {
      ...base.fields,
      '003': '000000',
      '090': opts.originalStan.padEnd(42, ' '),
    },
  }
}

/**
 * Build a single-message purchase (0200, processing code 28xxxx).
 * This is the most common POS flow: authorize and capture in one shot.
 */
export function buildPosSinglePurchase(opts: {
  cardToken:   string
  merchantRef: string
  terminalId:  string
  amount:      string | number
  currency?:   string
}): RawIsoMessage {
  const base = buildPosAuthorize(opts)
  return {
    mti: '0200',
    fields: { ...base.fields, '003': '280000' },
  }
}

/**
 * Build a reversal request (0400).
 * Sent by the POS when a transaction must be cancelled (e.g. chip fallback,
 * timeout, card removed mid-transaction).
 */
export function buildPosReversal(opts: {
  cardToken:    string
  merchantRef:  string
  terminalId:   string
  amount:       string | number
  originalStan: string
  currency?:    string
}): RawIsoMessage {
  const base = buildPosAuthorize(opts)
  return {
    mti: '0400',
    fields: {
      ...base.fields,
      '090': opts.originalStan.padEnd(42, ' '),
    },
  }
}

/** Build a network management / heartbeat message (0800). */
export function buildPosHeartbeat(): RawIsoMessage {
  return {
    mti: '0800',
    fields: {
      '007': nowTransmissionDt(),
      '011': randomStan(),
      '037': randomRrn(),
    },
  }
}

// ── ISO 8583 response code descriptions ──────────────────────────────────────

const RC_LABELS: Record<string, string> = {
  '00': 'Approved',
  '01': 'Refer to card issuer',
  '05': 'Do not honor',
  '10': 'Partial approval',
  '12': 'Invalid transaction',
  '13': 'Invalid amount',
  '14': 'Invalid card number',
  '30': 'Format error',
  '51': 'Insufficient funds',
  '54': 'Expired card',
  '57': 'Transaction not permitted',
  '94': 'Duplicate transmission',
  '96': 'System malfunction',
}

export function rcLabel(code: string | undefined): string {
  if (!code) return 'Unknown'
  return RC_LABELS[code] ?? `Code ${code}`
}
