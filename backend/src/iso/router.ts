/**
 * iso/router.ts
 * Routes parsed ISO 8583 messages to internal action types based on MTI.
 *
 * Routing rules:
 *  0100 → authorize
 *  0200 (proc code 00xxxx) → capture  (financial completion after a prior auth)
 *  0200 (proc code 28xxxx) → authorize_and_capture  (single-message transaction)
 *  0400 → release  (reversal before capture)
 *  0800 → heartbeat  (no-op)
 *  anything else → unsupported
 */
import { MTI } from './fields.js'
import type { ParsedIsoFields } from './parser.js'

export type IsoAction =
  | 'authorize'
  | 'authorize_and_capture'
  | 'capture'
  | 'release'
  | 'heartbeat'
  | 'unsupported'

export interface RoutingResult {
  action: IsoAction
  reason?: string
}

export function routeIsoMessage(parsed: ParsedIsoFields): RoutingResult {
  const { mti, processingCode } = parsed

  switch (mti) {
    case MTI.AUTH_REQUEST:
      return { action: 'authorize' }

    case MTI.FINANCIAL_REQUEST: {
      // Processing code first 2 digits: 00 = purchase (capture against prior auth)
      //                                  28 = purchase single-message (auth + capture)
      const procPrefix = processingCode.substring(0, 2)
      if (procPrefix === '28' || processingCode === '') {
        return { action: 'authorize_and_capture' }
      }
      return { action: 'capture' }
    }

    case MTI.REVERSAL_REQUEST:
      return { action: 'release' }

    case MTI.NETWORK_MANAGEMENT:
      return { action: 'heartbeat' }

    default:
      return {
        action: 'unsupported',
        reason: `MTI ${mti} is not handled by this middleware`,
      }
  }
}
