/**
 * mapping/normalizer.ts
 * Converts a parsed ISO 8583 message into the canonical PaymentMessage format
 * used internally by the middleware.
 *
 * Card-to-address and merchant-to-address lookups are performed against the
 * card_mapping and merchant_mapping PostgreSQL tables (seeded from JSON on
 * first boot). All lookups are async.
 */
import { parseUnits } from 'viem'
import type { Address } from 'viem'
import type { ParsedIsoFields } from '../iso/parser.js'
import { config } from '../config.js'
import {
  resolveCardAddress,
  resolveMerchantAddress as resolveMerchantAddressDb,
} from '../db/mappings.js'

/** Internal normalised payment message */
export interface PaymentMessage {
  /** Deterministic bytes32 txId (set by the caller after normalisation) */
  txId: `0x${string}`
  /** Ethereum address of the cardholder/user */
  userAddress: Address
  /** Ethereum address of the merchant */
  merchantAddress: Address
  /** ERC-20 token address that matches the ISO currency */
  tokenAddress: Address
  /** Amount in token's smallest unit (BigInt) */
  amountWei: bigint
  /** Unix timestamp (seconds) after which the hold expires */
  expiresAt: number
  /** ISO 8583 fields preserved for logging */
  isoFields: ParsedIsoFields
}

// ── Currency → token address ──────────────────────────────────────────────────
const CURRENCY_TO_TOKEN: Record<string, Address> = {
  USD:  '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA', // USDC mock
  USDC: '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA',
  USDT: '0xC7f974b3710560D070dEc95288339EfAB683C417',
}

export function resolveTokenAddress(currencyAlpha: string): Address {
  const addr = CURRENCY_TO_TOKEN[currencyAlpha.toUpperCase()]
  if (!addr) throw new Error(`No token address configured for currency: ${currencyAlpha}`)
  return addr
}

/** Token decimals cache */
const TOKEN_DECIMALS: Record<string, number> = {
  '0xa730efe70d3f67d08dd4a17a867c95bfe1f33cfa': 6, // USDC
  '0xc7f974b3710560d070dec95288339efab683c417': 6, // USDT
}

// ── Main normaliser ───────────────────────────────────────────────────────────

export async function normalize(
  fields: ParsedIsoFields,
  txId: `0x${string}`,
): Promise<PaymentMessage> {
  const userAddr = await resolveCardAddress(fields.cardToken)
  if (!userAddr) throw new Error(`No address mapping found for card token: ${fields.cardToken}`)

  const merchantAddr = await resolveMerchantAddressDb(fields.merchantRef)
  if (!merchantAddr) throw new Error(`No address mapping found for merchant ref: ${fields.merchantRef}`)

  const tokenAddress = resolveTokenAddress(fields.currencyAlpha)
  const decimals     = TOKEN_DECIMALS[tokenAddress.toLowerCase()] ?? 6
  const amountWei    = parseUnits(fields.amountDecimal, decimals)
  const expiresAt    = Math.floor(Date.now() / 1000) + config.HOLD_TTL_SECONDS

  return {
    txId,
    userAddress:     userAddr,
    merchantAddress: merchantAddr,
    tokenAddress,
    amountWei,
    expiresAt,
    isoFields: fields,
  }
}
