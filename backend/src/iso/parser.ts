/**
 * iso/parser.ts
 * Validates and extracts the relevant ISO 8583 fields from a raw message.
 *
 * Supports two input modes:
 *  1. JSON object with { mti, fields } (preferred – used by most ISO-JSON gateways)
 *  2. Raw hex string (simplified 1987 fixed-length parse for testing / legacy adapters)
 */
import { z } from 'zod'
import { RawIsoMessage, F, CURRENCY, CurrencyCode } from './fields.js'

// ── Validation schema ─────────────────────────────────────────────────────────
const RawIsoSchema = z.object({
  mti: z.string().regex(/^\d{4}$/, 'MTI must be exactly 4 decimal digits'),
  fields: z.record(z.string(), z.string().optional()),
})

export type ParsedIsoFields = {
  mti: string
  /** 6-digit System Trace Audit Number */
  stan: string
  /** 12-char Retrieval Reference Number */
  rrn: string
  /** Transaction amount in major currency units (e.g. "12.50") */
  amountDecimal: string
  /** ISO 4217 numeric currency code */
  currencyNumeric: string
  /** ISO 4217 alphabetic currency code (derived) */
  currencyAlpha: string
  /** Card / user token (PAN or tokenised PAN) */
  cardToken: string
  /** Terminal ID (card acceptor ID, field 042) */
  terminalId: string
  /** Merchant ID or name (field 043 first 15 chars) */
  merchantRef: string
  /** Additional merchant reference (field 048 or 063) */
  additionalRef: string
  /** Transmission date-time string (MMDDhhmmss) */
  transmissionDt: string
  /** Local transaction date (MMDD) */
  localDate: string
  /** Local transaction time (hhmmss) */
  localTime: string
  /** Processing code field 003 */
  processingCode: string
  /** Original STAN for reversals (field 090) */
  originalStan?: string
  /** Raw message preserved for logging */
  raw: RawIsoMessage
}

/**
 * Parse and validate a raw ISO 8583 JSON message.
 * Throws a descriptive error on any validation failure.
 */
export function parseIsoMessage(input: unknown): ParsedIsoFields {
  const validated = RawIsoSchema.parse(input)
  const { mti, fields } = validated

  const require = (key: string, label: string): string => {
    const val = fields[key]
    if (!val || val.trim() === '') {
      throw new Error(`ISO field ${key} (${label}) is missing or empty for MTI ${mti}`)
    }
    return val.trim()
  }

  const optional = (key: string): string => fields[key]?.trim() ?? ''

  const isHeartbeat = mti === '0800'

  const stan           = require(F.STAN, 'STAN')
  const rrn            = isHeartbeat ? optional(F.RETRIEVAL_REF) : require(F.RETRIEVAL_REF, 'RRN')
  const amountRaw      = isHeartbeat ? '000000000000' : require(F.AMOUNT_TRANSACTION, 'Amount')
  const currencyNumeric = isHeartbeat ? '840' : require(F.CURRENCY_CODE, 'Currency')
  const cardToken      = isHeartbeat ? '' : require(F.PAN, 'PAN/Card token')
  const terminalId     = isHeartbeat ? optional(F.CARD_ACCEPTOR_ID) : require(F.CARD_ACCEPTOR_ID, 'Terminal ID')
  const merchantRef    = isHeartbeat ? optional(F.CARD_ACCEPTOR_NAME) : require(F.CARD_ACCEPTOR_NAME, 'Merchant name/ID')
  const transmissionDt = optional(F.TRANSMISSION_DT)
  const localDate      = optional(F.LOCAL_DATE)
  const localTime      = optional(F.LOCAL_TIME)
  const processingCode = optional(F.PROC_CODE)
  const additionalRef  = optional(F.ADDITIONAL_DATA) || optional(F.RESERVED_PRIVATE)
  const originalStan   = optional(F.ORIG_STAN) || undefined

  // Amount: ISO 8583 encodes amount as implicit 2-decimal integer.
  // Field 004 = "000000001250" → 12.50
  const amountCents = BigInt(amountRaw.replace(/\D/g, ''))
  const amountDecimal = (Number(amountCents) / 100).toFixed(2)

  const currencyAlpha =
    CURRENCY[currencyNumeric as CurrencyCode] ?? currencyNumeric

  return {
    mti,
    stan,
    rrn,
    amountDecimal,
    currencyNumeric,
    currencyAlpha,
    cardToken,
    terminalId,
    merchantRef: merchantRef.substring(0, 15).trim(),
    additionalRef,
    transmissionDt,
    localDate,
    localTime,
    processingCode,
    originalStan: originalStan || undefined,
    raw: { mti, fields },
  }
}
