/**
 * iso/response.ts
 * Builds raw ISO 8583 binary response messages.
 *
 * Response MTI derivation:
 *   0100 (auth request)    → 0110 (auth response)
 *   0200 (capture request) → 0210 (capture response)
 *
 * Fields echoed back: 011 (STAN), 037 (RRN)
 * Fields added:       039 (response code)
 *
 * The output buffer includes the 2-byte TCP length header so it can be written
 * directly to a socket.
 */
import { encodeWithLengthHeader } from './codec.js'
import type { ParsedIsoFields } from './parser.js'

// ── ISO 8583 response codes ───────────────────────────────────────────────────

/** Well-known ISO 8583 response code values. */
export const RC = {
  APPROVED:             '00',
  PARTIAL_APPROVAL:     '10',
  INVALID_TRANSACTION:  '12',
  INVALID_AMOUNT:       '13',
  INVALID_CARD_NUMBER:  '14',
  INSUFFICIENT_FUNDS:   '51',
  EXPIRED_CARD:         '54',
  TRANSACTION_NOT_PERMITTED: '57',
  DUPLICATE_TRANSMISSION:    '94',
  SYSTEM_MALFUNCTION:   '96',
} as const

export type ResponseCode = (typeof RC)[keyof typeof RC]

// ── MTI derivation ────────────────────────────────────────────────────────────

const REQUEST_TO_RESPONSE: Record<string, string> = {
  '0100': '0110',
  '0200': '0210',
  '0400': '0410',
  '0800': '0810',
}

function responseMti(requestMti: string): string {
  return REQUEST_TO_RESPONSE[requestMti] ?? requestMti.replace(/.$/, '0')
}

// ── Builders ──────────────────────────────────────────────────────────────────

export interface BuildResponseOptions {
  /** ISO 8583 2-digit response code. */
  responseCode: string
  /** Optional auth ID code to echo back (field 038, 6 chars). */
  authId?: string
}

/**
 * Build an approved ISO 8583 response from the original parsed fields.
 * Returns a buffer ready to write to the TCP socket (includes length header).
 */
export function buildIsoApprovedResponse(
  parsed: ParsedIsoFields,
  authId?: string,
): Buffer {
  return buildIsoResponse(parsed, { responseCode: RC.APPROVED, authId })
}

/**
 * Build a decline ISO 8583 response from the original parsed fields.
 * Returns a buffer ready to write to the TCP socket (includes length header).
 */
export function buildIsoDeclineResponse(
  parsed: ParsedIsoFields,
  responseCode: string = RC.SYSTEM_MALFUNCTION,
): Buffer {
  return buildIsoResponse(parsed, { responseCode })
}

/**
 * Low-level response builder. Echoes STAN (011) and RRN (037) from the
 * original message and appends the response code (039).
 */
export function buildIsoResponse(
  parsed: ParsedIsoFields,
  opts: BuildResponseOptions,
): Buffer {
  const { responseCode, authId } = opts

  const fields: Record<string, string> = {
    '011': parsed.stan.padStart(6, '0'),           // STAN – echo
    '037': parsed.rrn.padStart(12, ' '),            // RRN  – echo
    '039': responseCode.substring(0, 2).padEnd(2, ' '), // Response code
  }

  if (authId) {
    fields['038'] = authId.substring(0, 6).padEnd(6, ' ')
  }

  return encodeWithLengthHeader({
    mti:    responseMti(parsed.mti),
    fields,
  })
}

/**
 * Build a minimal "parse error" decline response when we cannot even parse
 * the incoming message (we have no parsed fields to echo back).
 * Uses a zero STAN and zero RRN since we have no original values.
 */
export function buildFallbackDeclineResponse(
  requestMti: string,
  responseCode: string = RC.INVALID_TRANSACTION,
): Buffer {
  return encodeWithLengthHeader({
    mti: responseMti(requestMti),
    fields: {
      '011': '000000',
      '037': '000000000000',
      '039': responseCode,
    },
  })
}
