/**
 * scripts/reconcile.ts
 * Reconciliation script: compares the offchain payment_log against onchain
 * events and contract state to detect discrepancies.
 *
 * Usage:
 *   npx tsx scripts/reconcile.ts [--from-block 12345] [--to-block 67890]
 *
 * Output:
 *   - Prints a summary to stdout
 *   - Saves a JSON report to data/reconciliation-<timestamp>.json
 *   - Inserts a row into the reconciliation_run table
 */
import 'dotenv/config'
import { parseArgs }         from 'node:util'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, type Address, decodeEventLog } from 'viem'
import { arbitrumSepolia } from 'viem/chains'
import { gte }              from 'drizzle-orm'
import { config }            from '../src/config.js'
import { getDb }             from '../src/db/client.js'
import { paymentLog, reconciliationRun } from '../src/db/schema.js'
import { SETTLEMENT_ABI }    from '../src/relayer/abi.js'
import { rpcTransport }      from '../src/relayer/wallet.js'

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    'from-block': { type: 'string' },
    'to-block':   { type: 'string' },
  },
  allowPositionals: false,
})

// ── Types ─────────────────────────────────────────────────────────────────────
interface Mismatch {
  txId: string
  offchainStatus: string
  onchainStatus: string | null
  issue: string
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const db = getDb()

  const client = createPublicClient({
    chain: arbitrumSepolia,
    transport: rpcTransport(),
  })

  const CONTRACT = config.CONTRACT_ADDRESS as Address

  // Determine block range
  const latestBlock = await client.getBlockNumber()
  const fromBlock   = args['from-block'] ? BigInt(args['from-block']) : latestBlock - 10_000n
  const toBlock     = args['to-block']   ? BigInt(args['to-block'])   : latestBlock

  console.log(`\nReconciling blocks ${fromBlock} → ${toBlock} (${toBlock - fromBlock + 1n} blocks)\n`)

  // ── 1. Fetch onchain events ───────────────────────────────────────────────
  const onchainTxIds = new Map<string, string>() // txId → onchain status

  const eventNames = ['PaymentAuthorized', 'PaymentCaptured', 'PaymentReleased'] as const
  const statusMap: Record<string, string> = {
    PaymentAuthorized: 'authorized',
    PaymentCaptured:   'captured',
    PaymentReleased:   'released',
  }

  for (const eventName of eventNames) {
    const logs = await client.getLogs({
      address: CONTRACT,
      event: SETTLEMENT_ABI.find((e) => e.type === 'event' && e.name === eventName) as any,
      fromBlock,
      toBlock,
    })

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({ abi: SETTLEMENT_ABI, ...log })
        const txId = (decoded.args as { txId?: string }).txId
        if (txId) onchainTxIds.set(txId, statusMap[eventName])
      } catch {
        // skip
      }
    }
  }

  console.log(`  Onchain events found: ${onchainTxIds.size}`)

  // ── 2. Load offchain logs ─────────────────────────────────────────────────
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86_400
  const offchainRows = await db
    .select({
      tx_id:          paymentLog.tx_id,
      status:         paymentLog.status,
      onchain_status: paymentLog.onchain_status,
    })
    .from(paymentLog)
    .where(gte(paymentLog.created_at, cutoff))

  console.log(`  Offchain records checked: ${offchainRows.length}`)

  // ── 3. Compare ────────────────────────────────────────────────────────────
  const mismatches: Mismatch[] = []

  for (const row of offchainRows) {
    const onchainStatus = onchainTxIds.get(row.tx_id) ?? null

    if (row.status === 'confirmed' && !onchainStatus) {
      mismatches.push({
        txId: row.tx_id,
        offchainStatus: row.status,
        onchainStatus,
        issue: 'Offchain shows confirmed but no onchain event found in block range',
      })
    }

    if (row.status === 'failed' && onchainStatus) {
      mismatches.push({
        txId: row.tx_id,
        offchainStatus: row.status,
        onchainStatus,
        issue: 'Offchain shows failed but onchain event exists',
      })
    }

    if (
      row.onchain_status &&
      onchainStatus &&
      row.onchain_status !== onchainStatus
    ) {
      mismatches.push({
        txId: row.tx_id,
        offchainStatus: row.onchain_status,
        onchainStatus,
        issue: `Status mismatch: offchain=${row.onchain_status} onchain=${onchainStatus}`,
      })
    }
  }

  // ── 4. Save report ────────────────────────────────────────────────────────
  const report = {
    runAt:        new Date().toISOString(),
    fromBlock:    fromBlock.toString(),
    toBlock:      toBlock.toString(),
    totalChecked: offchainRows.length,
    mismatches:   mismatches.length,
    items:        mismatches,
  }

  mkdirSync('data', { recursive: true })
  const reportPath = `data/reconciliation-${Date.now()}.json`
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  // ── 5. Persist run to DB ──────────────────────────────────────────────────
  await db.insert(reconciliationRun).values({
    from_block:    Number(fromBlock),
    to_block:      Number(toBlock),
    total_checked: offchainRows.length,
    mismatches:    mismatches.length,
    report:        JSON.stringify(mismatches),
  })

  // ── 6. Print summary ──────────────────────────────────────────────────────
  console.log('\n── Reconciliation Summary ──────────────────────────────────')
  console.log(`  Blocks checked:   ${fromBlock} – ${toBlock}`)
  console.log(`  Records checked:  ${offchainRows.length}`)
  console.log(`  Onchain events:   ${onchainTxIds.size}`)
  console.log(`  Mismatches:       ${mismatches.length}`)
  console.log(`  Report saved to:  ${reportPath}`)

  if (mismatches.length > 0) {
    console.log('\n  Mismatch details:')
    mismatches.forEach((m, i) => {
      console.log(`  [${i + 1}] txId=${m.txId.substring(0, 18)}… issue=${m.issue}`)
    })
  }

  console.log('\n── Done ─────────────────────────────────────────────────────\n')
  process.exit(mismatches.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Reconciliation error:', err)
  process.exit(2)
})
