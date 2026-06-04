/**
 * iso/fields.ts
 * ISO 8583 field definitions and type declarations used throughout the middleware.
 *
 * We model a subset of the standard fields that are relevant for payment
 * authorization and capture flows.  The "raw" message is expected to arrive as
 * a plain JSON object whose keys are ISO bit-position strings ("002", "004", …).
 * This approach is compatible with most ISO-to-JSON gateways (e.g. jPOS, ISO-on-JSON).
 */

/** The raw ISO 8583 message as received from the upstream payment stack. */
export interface RawIsoMessage {
  /** Message Type Indicator – 4 decimal digits, e.g. "0100" */
  mti: string
  /** Bitmap fields keyed by their decimal position ("002".."128") */
  fields: Record<string, string | undefined>
}

// ── Well-known ISO 8583 MTIs ───────────────────────────────────────────────────
export const MTI = {
  AUTH_REQUEST:         '0100', // Authorization request
  AUTH_RESPONSE:        '0110', // Authorization response  (inbound from issuer)
  FINANCIAL_REQUEST:    '0200', // Financial / capture request
  FINANCIAL_RESPONSE:   '0210', // Financial response
  REVERSAL_REQUEST:     '0400', // Reversal request
  REVERSAL_RESPONSE:    '0410', // Reversal response
  NETWORK_MANAGEMENT:   '0800', // Network management (heartbeat / echo)
} as const

export type MTIValue = (typeof MTI)[keyof typeof MTI]

// ── Field positions (ISO 8583:1987 / 1993 / 2003) ────────────────────────────
export const F = {
  PAN:                  '002', // Primary Account Number (card number / token)
  PROC_CODE:            '003', // Processing Code
  AMOUNT_TRANSACTION:   '004', // Transaction Amount (12 digits, implied decimals)
  AMOUNT_SETTLEMENT:    '005', // Settlement Amount
  TRANSMISSION_DT:      '007', // Transmission Date & Time (MMDDhhmmss)
  STAN:                 '011', // System Trace Audit Number (6 digits)
  LOCAL_TIME:           '012', // Local Transaction Time (hhmmss)
  LOCAL_DATE:           '013', // Local Transaction Date (MMDD)
  EXPIRY_DATE:          '014', // Card Expiry Date (YYMM)
  SETTLEMENT_DATE:      '015', // Settlement Date
  CAPTURE_DATE:         '017', // Capture Date
  MERCHANT_TYPE:        '018', // Merchant Category Code
  ACQUIRER_INST_ID:     '032', // Acquiring Institution Identification Code
  RETRIEVAL_REF:        '037', // Retrieval Reference Number (RRN, 12 chars)
  AUTH_ID:              '038', // Authorization Identification Response
  RESPONSE_CODE:        '039', // Response Code
  CARD_ACCEPTOR_ID:     '042', // Card Acceptor Terminal Identification (terminal ID)
  CARD_ACCEPTOR_NAME:   '043', // Card Acceptor Name / Location (merchant ID encoded here)
  CURRENCY_CODE:        '049', // Transaction Currency Code (ISO 4217 numeric)
  ADDITIONAL_DATA:      '048', // Additional Data – Private
  RESERVED_PRIVATE:     '063', // Reserved Private (used for supplementary merchant ref)
  ORIG_STAN:            '090', // Original Data Elements (contains original STAN for reversals)
} as const

// ── ISO 4217 numeric currency codes ──────────────────────────────────────────
export const CURRENCY = {
  '840': 'USD',
  '978': 'EUR',
  '032': 'ARS',
  '986': 'BRL',
  '484': 'MXN',
} as const

export type CurrencyCode = keyof typeof CURRENCY
