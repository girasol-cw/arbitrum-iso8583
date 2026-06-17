/**
 * scripts/seed-card-mapping.ts
 * Reads the JSON produced by FundUsers.s.sol and upserts into the
 * card_mapping table. It also upserts local development merchant mappings so
 * the ISO/POS simulators can resolve merchant_ref → address.
 *
 * Usage:
 *   tsx scripts/seed-card-mapping.ts
 *   tsx scripts/seed-card-mapping.ts --file /custom/path/funded-wallets.json
 *
 * The JSON file has the format { "CARD_TOKEN": "0xAddress", ... }
 * which is exactly what vm.serializeAddress produces in FundUsers.s.sol.
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'
import { parseArgs }                from 'node:util'
import { sql }                      from 'drizzle-orm'
import { getDb, runMigrations, closeDb } from '../src/db/client.js'
import { cardMapping, merchantMapping } from '../src/db/schema.js'
import { TEST_CARD_MAP, TEST_MERCHANT_MAP } from '../src/config/testWallets.js'

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: { file: { type: 'string' } },
  strict: false,
})
const fileArg = typeof args.file === 'string' ? args.file : undefined

const DEFAULT_PATH = resolve(
  import.meta.dirname ?? process.cwd(),
  '../../contracts/script/output/funded-wallets.json',
)

const jsonPath = fileArg
  ? resolve(process.cwd(), fileArg)
  : DEFAULT_PATH

// ── Cargar JSON o usar testWallets como fallback ──────────────────────────────

let mapping: Record<string, string>

if (fileArg) {
  // Explicit path: must exist
  const explicit = resolve(process.cwd(), fileArg)
  try {
    mapping = JSON.parse(readFileSync(explicit, 'utf-8'))
    console.log(`\nSource: ${explicit}`)
  } catch {
    console.error(`\n✗ Could not read: ${explicit}\n`)
    process.exit(1)
  }
} else if (existsSync(jsonPath)) {
  // Forge JSON available
  mapping = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  console.log(`\nSource: ${jsonPath}`)
} else {
  // Fallback: wallets hardcoded in testWallets.ts
  mapping = TEST_CARD_MAP
  console.log('\nSource: testWallets.ts (fallback — funded-wallets.json not found)')
  console.log('  To fund wallets: cd contracts && forge script script/FundUsers.s.sol --rpc-url arbitrum-sepolia --private-key $DEPLOYER_PK --broadcast\n')
}

// ── Upsert into DB ────────────────────────────────────────────────────────────

await runMigrations()
const db = getDb()

const entries = Object.entries(mapping)
if (entries.length === 0) {
  console.error('✗ No entries to insert.')
  process.exit(1)
}

console.log(`Upserting ${entries.length} entries into card_mapping...\n`)

for (const [cardToken, rawAddress] of entries) {
  const ethAddress = rawAddress.toLowerCase()

  await db
    .insert(cardMapping)
    .values({
      card_token:  cardToken,
      eth_address: ethAddress,
      label:       cardToken,
      active:      true,
      created_at:  Math.floor(Date.now() / 1000),
      updated_at:  Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: cardMapping.card_token,
      set: {
        eth_address: ethAddress,
        label:       cardToken,
        active:      true,
        updated_at:  sql`extract(epoch from now())::integer`,
      },
    })

  console.log(`  ✓  ${cardToken}  →  ${ethAddress}`)
}

const merchantEntries = Object.entries(TEST_MERCHANT_MAP)
console.log(`\nUpserting ${merchantEntries.length} entries into merchant_mapping...\n`)

for (const [merchantRef, rawAddress] of merchantEntries) {
  const ethAddress = rawAddress.toLowerCase()

  await db
    .insert(merchantMapping)
    .values({
      merchant_ref: merchantRef,
      eth_address:  ethAddress,
      label:        merchantRef,
      active:       true,
      created_at:   Math.floor(Date.now() / 1000),
      updated_at:   Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: merchantMapping.merchant_ref,
      set: {
        eth_address: ethAddress,
        label:       merchantRef,
        active:      true,
        updated_at:  sql`extract(epoch from now())::integer`,
      },
    })

  console.log(`  ✓  ${merchantRef}  →  ${ethAddress}`)
}

await closeDb()
console.log('\ncard_mapping and merchant_mapping updated successfully.\n')
