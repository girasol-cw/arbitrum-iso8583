/**
 * iso.ts  –  Parser + Router ISO 8583
 *
 * parse: { mti, fields } → ParsedIsoFields
 * route: mti → acción del contrato
 */
import { z } from 'zod'
import { keccak256, encodePacked } from 'viem'

// ── Constantes de campos ──────────────────────────────────────────────────────
const F = { PAN:'002', PROC_CODE:'003', AMOUNT_TRANSACTION:'004',
  TRANSMISSION_DT:'007', STAN:'011', LOCAL_TIME:'012', LOCAL_DATE:'013',
  RETRIEVAL_REF:'037', CARD_ACCEPTOR_ID:'042', CARD_ACCEPTOR_NAME:'043',
  ADDITIONAL_DATA:'048', CURRENCY_CODE:'049', RESERVED_PRIVATE:'063', ORIG_STAN:'090' }

const CURRENCY: Record<string, string> = { '840':'USD','978':'EUR','032':'ARS','986':'BRL','484':'MXN' }

// ── Tipos públicos ────────────────────────────────────────────────────────────
export interface ParsedIsoFields {
  mti: string; stan: string; rrn: string; amountDecimal: string
  currencyNumeric: string; currencyAlpha: string; cardToken: string
  terminalId: string; merchantRef: string; additionalRef: string
  transmissionDt: string; localDate: string; localTime: string
  processingCode: string; originalStan?: string
  raw: { mti: string; fields: Record<string, string | undefined> }
}

export type IsoAction = 'authorize' | 'authorize_and_capture' | 'capture' | 'release' | 'heartbeat' | 'unsupported'
export interface RoutingResult { action: IsoAction; reason?: string }

// ── Parser ────────────────────────────────────────────────────────────────────
const Schema = z.object({
  mti: z.string().regex(/^\d{4}$/),
  fields: z.record(z.string(), z.string().optional()),
})

export function parseIsoMessage(input: unknown): ParsedIsoFields {
  const { mti, fields } = Schema.parse(input)
  const req = (k: string, label: string) => {
    const v = fields[k]?.trim()
    if (!v) throw new Error(`Campo ISO ${k} (${label}) faltante en MTI ${mti}`)
    return v
  }
  const opt = (k: string) => fields[k]?.trim() ?? ''

  const amountRaw = req(F.AMOUNT_TRANSACTION, 'Amount')
  const currencyNumeric = req(F.CURRENCY_CODE, 'Currency')

  return {
    mti,
    stan:            req(F.STAN, 'STAN'),
    rrn:             req(F.RETRIEVAL_REF, 'RRN'),
    amountDecimal:   (Number(BigInt(amountRaw.replace(/\D/g, ''))) / 100).toFixed(2),
    currencyNumeric,
    currencyAlpha:   CURRENCY[currencyNumeric] ?? currencyNumeric,
    cardToken:       req(F.PAN, 'PAN'),
    terminalId:      req(F.CARD_ACCEPTOR_ID, 'Terminal'),
    merchantRef:     req(F.CARD_ACCEPTOR_NAME, 'Merchant').substring(0, 15).trim(),
    additionalRef:   opt(F.ADDITIONAL_DATA) || opt(F.RESERVED_PRIVATE),
    transmissionDt:  opt(F.TRANSMISSION_DT),
    localDate:       opt(F.LOCAL_DATE),
    localTime:       opt(F.LOCAL_TIME),
    processingCode:  opt(F.PROC_CODE),
    originalStan:    opt(F.ORIG_STAN) || undefined,
    raw:             { mti, fields },
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export function routeIsoMessage(p: ParsedIsoFields): RoutingResult {
  switch (p.mti) {
    case '0100': return { action: 'authorize' }
    case '0200': return { action: p.processingCode.startsWith('28') ? 'authorize_and_capture' : 'capture' }
    case '0400': return { action: 'release' }
    case '0800': return { action: 'heartbeat' }
    default:     return { action: 'unsupported', reason: `MTI ${p.mti} no soportado` }
  }
}

// ── txId determinista ─────────────────────────────────────────────────────────
export function deriveTxId(f: ParsedIsoFields): `0x${string}` {
  return keccak256(encodePacked(
    ['string','string','string','string','string'],
    [f.stan, f.rrn, f.merchantRef, f.terminalId, f.localDate],
  ))
}

export function deriveReversalTxId(f: ParsedIsoFields): `0x${string}` {
  return deriveTxId(f.originalStan ? { ...f, stan: f.originalStan } : f)
}
