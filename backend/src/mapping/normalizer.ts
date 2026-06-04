/**
 * mapping/normalizer.ts
 * Converts a parsed ISO 8583 message into the canonical PaymentMessage format
 * used internally by the middleware.
 *
 * Card-to-address and merchant-to-address lookups are performed here, backed by
 * configurable JSON mapping files (card-mapping.json / merchant-mapping.json).
 * In production these should be replaced with a secrets-backed service call.
 */
import { existsSync, readFileSync } from 'fs'
import { parseUnits } from 'viem'
import type { Address } from 'viem'
import type { ParsedIsoFields } from '../iso/parser.js'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'

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

// ── Mapping file loaders ─────────────────────────────────────────────────────

type AddressMap = Record<string, Address>

function loadJsonMap(path: string, label: string): AddressMap {
  if (!existsSync(path)) {
    logger.warn({ path, label }, 'Mapping file not found – lookups will fail')
    return {}
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as AddressMap
  } catch (err) {
    logger.error({ path, label, err }, 'Failed to parse mapping file')
    return {}
  }
}

// Lazy-loaded maps (reloaded each process start; use a watcher in production)
let _cardMap: AddressMap | null = null
let _merchantMap: AddressMap | null = null

function cardMap(): AddressMap {
  if (!_cardMap) _cardMap = loadJsonMap(config.CARD_MAPPING_FILE, 'card-mapping')
  return _cardMap
}

function merchantMap(): AddressMap {
  if (!_merchantMap) _merchantMap = loadJsonMap(config.MERCHANT_MAPPING_FILE, 'merchant-mapping')
  return _merchantMap
}

/** Resolve a card token to its Ethereum address. Throws if not found. */
export function resolveUserAddress(cardToken: string): Address {
  const addr = cardMap()[cardToken]
  if (!addr) throw new Error(`No address mapping found for card token: ${cardToken}`)
  return addr
}

/** Resolve a merchant reference to its Ethereum address. Throws if not found. */
export function resolveMerchantAddress(merchantRef: string): Address {
  const addr = merchantMap()[merchantRef]
  if (!addr) throw new Error(`No address mapping found for merchant ref: ${merchantRef}`)
  return addr
}

// ── Currency → token address ──────────────────────────────────────────────────
const CURRENCY_TO_TOKEN: Record<string, Address> = {
  // USD stablecoins on Arbitrum Sepolia
  USD: '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA', // USDC mock
  USDC: '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA',
  USDT: '0xC7f974b3710560D070dEc95288339EfAB683C417',
}

export function resolveTokenAddress(currencyAlpha: string): Address {
  const addr = CURRENCY_TO_TOKEN[currencyAlpha.toUpperCase()]
  if (!addr) throw new Error(`No token address configured for currency: ${currencyAlpha}`)
  return addr
}

// ── Main normaliser ───────────────────────────────────────────────────────────

/** Token decimals cache (populated lazily) */
const TOKEN_DECIMALS: Record<string, number> = {
  '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA': 6, // USDC
  '0xC7f974b3710560D070dEc95288339EfAB683C417': 6, // USDT
}

export function normalize(
  fields: ParsedIsoFields,
  txId: `0x${string}`,
): PaymentMessage {
  const userAddress     = resolveUserAddress(fields.cardToken)
  const merchantAddress = resolveMerchantAddress(fields.merchantRef)
  const tokenAddress    = resolveTokenAddress(fields.currencyAlpha)
  const decimals        = TOKEN_DECIMALS[tokenAddress.toLowerCase()] ?? 6

  const amountWei = parseUnits(fields.amountDecimal, decimals)
  const expiresAt = Math.floor(Date.now() / 1000) + config.HOLD_TTL_SECONDS

  return {
    txId,
    userAddress,
    merchantAddress,
    tokenAddress,
    amountWei,
    expiresAt,
    isoFields: fields,
  }
}

/** Expose for testing without singleton state */
export function _resetMaps() {
  _cardMap = null
  _merchantMap = null
}
