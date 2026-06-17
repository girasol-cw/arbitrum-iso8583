/**
 * db/mappings.ts
 * CRUD operations for card_mapping and merchant_mapping tables.
 *
 * seedMappings() is called at startup to populate the DB from the legacy JSON
 * files if the tables are empty, providing a zero-friction migration path.
 * After the first boot the JSON files are no longer consulted.
 */
import { existsSync, readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { getDb } from './client.js'
import { cardMapping, merchantMapping } from './schema.js'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'
import type { Address } from 'viem'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CardMappingRow {
  id:          number
  card_token:  string
  eth_address: string
  label:       string | null
  active:      boolean
  created_at:  number
  updated_at:  number
}

export interface MerchantMappingRow {
  id:           number
  merchant_ref: string
  eth_address:  string
  label:        string | null
  active:       boolean
  created_at:   number
  updated_at:   number
}

// ── Card mapping ──────────────────────────────────────────────────────────────

export async function resolveCardAddress(cardToken: string): Promise<Address | null> {
  const db   = getDb()
  const rows = await db
    .select()
    .from(cardMapping)
    .where(eq(cardMapping.card_token, cardToken))
    .limit(1)
  const row = rows[0]
  if (!row || !row.active) return null
  return row.eth_address as Address
}

export async function upsertCardMapping(
  cardToken: string,
  ethAddress: string,
  label?: string,
): Promise<CardMappingRow> {
  const db  = getDb()
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .insert(cardMapping)
    .values({ card_token: cardToken, eth_address: ethAddress, label: label ?? null, updated_at: now })
    .onConflictDoUpdate({
      target: cardMapping.card_token,
      set: { eth_address: ethAddress, label: label ?? null, active: true, updated_at: now },
    })
    .returning()
  return rows[0] as CardMappingRow
}

export async function deactivateCardMapping(cardToken: string): Promise<boolean> {
  const db  = getDb()
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .update(cardMapping)
    .set({ active: false, updated_at: now })
    .where(eq(cardMapping.card_token, cardToken))
    .returning()
  return rows.length > 0
}

export async function listCardMappings(): Promise<CardMappingRow[]> {
  return getDb().select().from(cardMapping) as Promise<CardMappingRow[]>
}

// ── Merchant mapping ──────────────────────────────────────────────────────────

export async function resolveMerchantAddress(merchantRef: string): Promise<Address | null> {
  const db   = getDb()
  const rows = await db
    .select()
    .from(merchantMapping)
    .where(eq(merchantMapping.merchant_ref, merchantRef))
    .limit(1)
  const row = rows[0]
  if (!row || !row.active) return null
  return row.eth_address as Address
}

export async function upsertMerchantMapping(
  merchantRef: string,
  ethAddress: string,
  label?: string,
): Promise<MerchantMappingRow> {
  const db  = getDb()
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .insert(merchantMapping)
    .values({ merchant_ref: merchantRef, eth_address: ethAddress, label: label ?? null, updated_at: now })
    .onConflictDoUpdate({
      target: merchantMapping.merchant_ref,
      set: { eth_address: ethAddress, label: label ?? null, active: true, updated_at: now },
    })
    .returning()
  return rows[0] as MerchantMappingRow
}

export async function deactivateMerchantMapping(merchantRef: string): Promise<boolean> {
  const db  = getDb()
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .update(merchantMapping)
    .set({ active: false, updated_at: now })
    .where(eq(merchantMapping.merchant_ref, merchantRef))
    .returning()
  return rows.length > 0
}

export async function listMerchantMappings(): Promise<MerchantMappingRow[]> {
  return getDb().select().from(merchantMapping) as Promise<MerchantMappingRow[]>
}

// ── Seed from JSON files ──────────────────────────────────────────────────────
// Called once at startup. If the tables already have rows, this is a no-op.

function loadJson(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

export async function seedMappings(): Promise<void> {
  const db = getDb()

  // Check if tables already have data
  const [existingCards, existingMerchants] = await Promise.all([
    db.select().from(cardMapping).limit(1),
    db.select().from(merchantMapping).limit(1),
  ])

  const cardJson     = loadJson(config.CARD_MAPPING_FILE)
  const merchantJson = loadJson(config.MERCHANT_MAPPING_FILE)

  if (existingCards.length === 0 && Object.keys(cardJson).length > 0) {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(cardMapping).values(
      Object.entries(cardJson).map(([token, addr]) => ({
        card_token:  token,
        eth_address: addr,
        label:       token,
        updated_at:  now,
      })),
    )
    logger.info({ count: Object.keys(cardJson).length }, 'Seeded card_mapping from JSON file')
  }

  if (existingMerchants.length === 0 && Object.keys(merchantJson).length > 0) {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(merchantMapping).values(
      Object.entries(merchantJson).map(([ref, addr]) => ({
        merchant_ref: ref,
        eth_address:  addr,
        label:        ref,
        updated_at:   now,
      })),
    )
    logger.info({ count: Object.keys(merchantJson).length }, 'Seeded merchant_mapping from JSON file')
  }
}
