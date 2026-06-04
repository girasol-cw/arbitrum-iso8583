/**
 * mapping/txId.ts
 * Deterministic transaction-ID derivation from ISO 8583 fields.
 *
 * txId = keccak256(abi.encodePacked(stan, rrn, merchantRef, terminalId, localDate))
 *
 * This produces a stable bytes32 identifier that:
 *  - Is the same for retries of the exact same ISO message
 *  - Differs across different merchants / terminals / dates
 *  - Maps 1-to-1 to the on-chain Hold.txId
 *
 * Security note: STAN is only 6 digits and can theoretically collide across
 * acquirers. The compound key (STAN + RRN + merchantRef + terminalId + date)
 * makes collisions practically impossible within a single payment network, but
 * for cross-network disambiguation the host application should add an acquirer
 * prefix to merchantRef or use the additionalRef field.
 */
import { keccak256, encodePacked } from 'viem'
import type { ParsedIsoFields } from '../iso/parser.js'

/**
 * Derive a bytes32 txId from ISO fields.
 * Returns a 0x-prefixed hex string suitable for use as bytes32 in Solidity.
 */
export function deriveTxId(fields: ParsedIsoFields): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string', 'string'],
      [
        fields.stan,
        fields.rrn,
        fields.merchantRef,
        fields.terminalId,
        fields.localDate,
      ],
    ),
  )
}

/**
 * Derive txId for a reversal using the original STAN embedded in field 090.
 * Falls back to normal derivation if no originalStan is present.
 */
export function deriveReversalTxId(fields: ParsedIsoFields): `0x${string}` {
  if (!fields.originalStan) return deriveTxId(fields)

  const reversalFields: ParsedIsoFields = {
    ...fields,
    stan: fields.originalStan,
  }
  return deriveTxId(reversalFields)
}
