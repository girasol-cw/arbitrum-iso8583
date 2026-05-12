import { useEffect, useMemo, useRef, useState } from 'react'
import { encodePacked, isAddress, keccak256 } from 'viem'
import type { Address, Hex } from 'viem'

import { useAppStore } from '../store'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { randomBytes32, shortenAddress, toTokenAmount } from '../lib/utils'
import { useContractActions } from '../hooks/useContractActions'

type Distribution = 'uniform' | 'frontloaded' | 'backloaded' | 'bursty'
type StressPhase = 'idle' | 'running' | 'done' | 'aborted'

interface PlannedStressTx {
  index: number
  txId: Hex
  user: Address
  merchant: Address
  human: string
  capture: boolean
}

interface PlannedBatch {
  batchId: number
  offsetMs: number
  captureDelayMs: number
  items: PlannedStressTx[]
}

interface BatchExecution {
  batchId: number
  scheduledSec: number
  actualSec: number
  size: number
  authOk: number
  authErr: number
  capOk: number
  capErr: number
  driftMs: number
}

interface StressStats {
  plannedTxs: number
  plannedBatches: number
  dispatchedBatches: number
  authOk: number
  authErr: number
  capOk: number
  capErr: number
}

interface StressEvent {
  id: number
  level: 'info' | 'ok' | 'error'
  message: string
}

const DEFAULT_PAYER_POOL = TEST_ACCOUNTS.map(a => a.address).join('\n')

function clampInt(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max)
}

function clampFloat(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sample<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function approxNormal() {
  return (Math.random() + Math.random() + Math.random()) / 3
}

function parseAddressPool(text: string) {
  return text
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter((value): value is Address => isAddress(value))
}

function deriveAddress(namespace: string, index: number): Address {
  return `0x${keccak256(encodePacked(['string', 'uint256'], [namespace, BigInt(index)])).slice(26)}` as Address
}

function formatRandomAmount(min: number, max: number, decimals: number) {
  const value = min + Math.random() * Math.max(max - min, 0)
  const precision = Math.min(decimals, 2)
  return value.toFixed(precision)
}

function randomOffsetMs(distribution: Distribution, durationMs: number) {
  const u = Math.random()
  switch (distribution) {
    case 'frontloaded':
      return Math.round(durationMs * u * u)
    case 'backloaded':
      return Math.round(durationMs * (1 - (1 - u) * (1 - u)))
    case 'bursty': {
      const centers = [0.08, 0.22, 0.48, 0.74, 0.9]
      const center = sample(centers)
      const spread = 0.03 + Math.random() * 0.08
      const shifted = center + (approxNormal() - 0.5) * 2 * spread
      return Math.round(durationMs * clampFloat(shifted, 0, 1))
    }
    case 'uniform':
    default:
      return Math.round(durationMs * u)
  }
}

export function StressOpsPanel() {
  const { tokens, addLog, activeWalletIdx } = useAppStore()
  const { burstAuthorize, burstCapture, refreshWalletBalances, approveToken, deposit, queryBalance } = useContractActions()

  const [tokenAddr, setTokenAddr] = useState('')
  const [totalTxs, setTotalTxs] = useState('1000')
  const [minAmount, setMinAmount] = useState('10')
  const [maxAmount, setMaxAmount] = useState('20')
  const [durationSec, setDurationSec] = useState('300')
  const [minBatchSize, setMinBatchSize] = useState('2')
  const [maxBatchSize, setMaxBatchSize] = useState('20')
  const [distribution, setDistribution] = useState<Distribution>('bursty')
  const [expiresIn, setExpiresIn] = useState('900')
  const [captureRatio, setCaptureRatio] = useState('0.65')
  const [maxCaptureLagSec, setMaxCaptureLagSec] = useState('20')
  const [payerPoolText, setPayerPoolText] = useState(DEFAULT_PAYER_POOL)
  const [merchantPoolText, setMerchantPoolText] = useState('')

  const [plan, setPlan] = useState<PlannedBatch[]>([])
  const [phase, setPhase] = useState<StressPhase>('idle')
  const [stats, setStats] = useState<StressStats>({
    plannedTxs: 0,
    plannedBatches: 0,
    dispatchedBatches: 0,
    authOk: 0,
    authErr: 0,
    capOk: 0,
    capErr: 0,
  })
  const [executions, setExecutions] = useState<BatchExecution[]>([])
  const [events, setEvents] = useState<StressEvent[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)

  const startedAtRef = useRef<number | null>(null)
  const abortRef = useRef(false)
  const eventIdRef = useRef(0)

  useEffect(() => {
    if (tokenAddr === '' && tokens.length > 0) setTokenAddr(tokens[0].address)
  }, [tokenAddr, tokens])

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current)
      }
    }, 500)
    return () => clearInterval(id)
  }, [phase])

  const token = tokens.find(t => t.address === tokenAddr) ?? tokens[0]

  const payerPool = useMemo(() => {
    const parsed = parseAddressPool(payerPoolText)
    return parsed.length > 0 ? parsed : [TEST_ACCOUNTS[0].address]
  }, [payerPoolText])

  const merchantPool = useMemo(
    () => parseAddressPool(merchantPoolText),
    [merchantPoolText],
  )

  const addEvent = (level: StressEvent['level'], message: string) => {
    const id = ++eventIdRef.current
    setEvents(prev => [...prev, { id, level, message }].slice(-220))
  }

  const buildPlan = () => {
    if (!token) return [] as PlannedBatch[]

    const txCount = clampInt(parseInt(totalTxs) || 0, 1, 5000)
    const minAmt = Math.max(0.01, parseFloat(minAmount) || 0)
    const maxAmt = Math.max(minAmt, parseFloat(maxAmount) || minAmt)
    const durationMs = Math.max(5, parseInt(durationSec) || 300) * 1000
    const minBatch = clampInt(parseInt(minBatchSize) || 1, 1, txCount)
    const maxBatch = clampInt(parseInt(maxBatchSize) || minBatch, minBatch, Math.min(200, txCount))
    const captureProb = clampFloat(parseFloat(captureRatio) || 0, 0, 1)
    const captureLagMaxMs = Math.max(0, parseInt(maxCaptureLagSec) || 0) * 1000

    let remaining = txCount
    let txIndex = 0
    const batches: PlannedBatch[] = []

    while (remaining > 0) {
      const upper = Math.min(maxBatch, remaining)
      const size = remaining <= minBatch
        ? remaining
        : clampInt(minBatch + Math.floor(Math.random() * (upper - minBatch + 1)), minBatch, upper)

      const items = Array.from({ length: size }, () => {
        txIndex += 1
        return {
          index: txIndex,
          txId: randomBytes32(),
          user: sample(payerPool),
          merchant: merchantPool.length > 0 ? sample(merchantPool) : deriveAddress('stress-merch', txIndex),
          human: formatRandomAmount(minAmt, maxAmt, token.decimals),
          capture: Math.random() < captureProb,
        } satisfies PlannedStressTx
      })

      batches.push({
        batchId: batches.length + 1,
        offsetMs: randomOffsetMs(distribution, durationMs),
        captureDelayMs: captureLagMaxMs > 0 ? Math.floor(Math.random() * (captureLagMaxMs + 1)) : 0,
        items,
      })
      remaining -= size
    }

    return batches
      .sort((a, b) => a.offsetMs - b.offsetMs)
      .map((batch, idx) => ({ ...batch, batchId: idx + 1 }))
  }

  const regeneratePlan = () => {
    const nextPlan = buildPlan()
    setPlan(nextPlan)
    setStats({
      plannedTxs: nextPlan.reduce((sum, batch) => sum + batch.items.length, 0),
      plannedBatches: nextPlan.length,
      dispatchedBatches: 0,
      authOk: 0,
      authErr: 0,
      capOk: 0,
      capErr: 0,
    })
    setExecutions([])
    setEvents([])
    setElapsedMs(0)
    setPhase('idle')
  }

  const handleRun = async () => {
    if (!token) return

    const nextPlan = plan.length > 0 ? plan : buildPlan()
    if (nextPlan.length === 0) return

    abortRef.current = false
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    setPlan(nextPlan)
    setExecutions([])
    setEvents([])
    setPhase('running')
    setStats({
      plannedTxs: nextPlan.reduce((sum, batch) => sum + batch.items.length, 0),
      plannedBatches: nextPlan.length,
      dispatchedBatches: 0,
      authOk: 0,
      authErr: 0,
      capOk: 0,
      capErr: 0,
    })

    addEvent('info', `Generated ${nextPlan.length} batch(es) for ${nextPlan.reduce((sum, batch) => sum + batch.items.length, 0)} tx over ~${durationSec}s.`)
    addLog('info', `Stress run started: ${nextPlan.reduce((sum, batch) => sum + batch.items.length, 0)} tx / ${nextPlan.length} batches`)

    // ── Preflight: ensure each payer has enough available balance ─────────────
    if (token) {
      addEvent('info', 'Preflight: checking payer balances…')

      const neededByPayer = new Map<Address, bigint>()
      for (const batch of nextPlan) {
        for (const item of batch.items) {
          const atoms = toTokenAmount(item.human, token.decimals)
          neededByPayer.set(item.user, (neededByPayer.get(item.user) ?? 0n) + atoms)
        }
      }

      const connectedAddr = TEST_ACCOUNTS[activeWalletIdx]?.address

      for (const [payer, needed] of neededByPayer) {
        if (abortRef.current) break

        const bal = await queryBalance(payer, token.address)
        const available = bal?.available ?? 0n

        if (available >= needed) {
          addEvent('ok', `Payer ${shortenAddress(payer)} OK — available ${(Number(available) / 10 ** token.decimals).toFixed(2)} ${token.symbol}`)
          continue
        }

        const deficit = needed - available

        if (!connectedAddr || payer.toLowerCase() !== connectedAddr.toLowerCase()) {
          addEvent('error', `Payer ${shortenAddress(payer)} needs ${(Number(deficit) / 10 ** token.decimals).toFixed(2)} ${token.symbol} but is not the connected wallet — skipping auto-deposit`)
          continue
        }

        // Add a small 1% buffer to cover rounding
        const deficitHuman = (Number(deficit) / 10 ** token.decimals * 1.01).toFixed(token.decimals)
        addEvent('info', `Auto-depositing ${deficitHuman} ${token.symbol} for ${shortenAddress(payer)}…`)

        const appHash = await approveToken(token.address, deficitHuman, token.decimals)
        if (!appHash) {
          addEvent('error', 'approve failed — aborting stress run')
          setPhase('aborted')
          return
        }

        const depResult = await deposit(token.address, deficitHuman, token.decimals)
        if (!depResult) {
          addEvent('error', 'deposit failed — aborting stress run')
          setPhase('aborted')
          return
        }

        addEvent('ok', `Preflight deposit done: ${deficitHuman} ${token.symbol} → ${shortenAddress(payer)}`)
      }

      if (abortRef.current) {
        setPhase('aborted')
        return
      }

      addEvent('info', 'Preflight complete — starting scheduler.')
      // Reset the start clock after preflight (deposit txs can take several seconds)
      startedAtRef.current = Date.now()
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      for (const batch of nextPlan) {
        if (abortRef.current) break

        const targetAt = (startedAtRef.current ?? Date.now()) + batch.offsetMs
        const waitMs = Math.max(0, targetAt - Date.now())
        if (waitMs > 0) await sleep(waitMs)
        if (abortRef.current) break

        const started = Date.now()
        const driftMs = started - targetAt
        addEvent('info', `Batch #${batch.batchId} dispatching ${batch.items.length} auth tx (drift ${driftMs}ms).`)

        const authResults = await burstAuthorize(
          batch.items.map(item => ({
            txId: item.txId,
            user: item.user,
            merchant: item.merchant,
            token: token.address,
            human: item.human,
            decimals: token.decimals,
            expiresIn: Math.max(1, parseInt(expiresIn) || 900),
          })),
          { skipRefresh: true },
        )

        const authOk = authResults.filter(r => r.ok).length
        const authErr = authResults.length - authOk
        const captureTxIds = authResults
          .filter((r, i) => r.ok && batch.items[i]?.capture)
          .map(r => r.txId as Hex)

        let capOk = 0
        let capErr = 0

        if (!abortRef.current && captureTxIds.length > 0) {
          if (batch.captureDelayMs > 0) {
            await sleep(batch.captureDelayMs)
          }

          if (!abortRef.current) {
            const capResults = await burstCapture(captureTxIds, { skipRefresh: true })
            capOk = capResults.filter(r => r.ok).length
            capErr = capResults.length - capOk
          }
        }

        setExecutions(prev => ([
          ...prev,
          {
            batchId: batch.batchId,
            scheduledSec: Math.round(batch.offsetMs / 1000),
            actualSec: Math.round(((started - (startedAtRef.current ?? started)) / 1000) * 10) / 10,
            size: batch.items.length,
            authOk,
            authErr,
            capOk,
            capErr,
            driftMs,
          },
        ]))

        setStats(prev => ({
          ...prev,
          dispatchedBatches: prev.dispatchedBatches + 1,
          authOk: prev.authOk + authOk,
          authErr: prev.authErr + authErr,
          capOk: prev.capOk + capOk,
          capErr: prev.capErr + capErr,
        }))

        addEvent(
          authErr > 0 || capErr > 0 ? 'error' : 'ok',
          `Batch #${batch.batchId} finished — auth ${authOk}/${batch.items.length} ok${captureTxIds.length > 0 ? ` | capture ${capOk}/${captureTxIds.length} ok` : ''}`,
        )
      }

      await refreshWalletBalances(token.address)
      setPhase(abortRef.current ? 'aborted' : 'done')
      addLog(abortRef.current ? 'info' : 'ok', abortRef.current ? 'Stress run aborted by user.' : 'Stress run finished.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addEvent('error', `Stress run failed: ${msg}`)
      addLog('error', `stress run: ${msg}`)
      setPhase('aborted')
    }
  }

  const preview = plan.length > 0 ? plan : buildPlan()
  const previewTxs = preview.reduce((sum, batch) => sum + batch.items.length, 0)
  const previewDurationMs = preview.length > 0 ? Math.max(...preview.map(batch => batch.offsetMs + batch.captureDelayMs)) : 0

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Randomized Stress Scheduler</span>
        <span className="ml-auto text-[11px] text-slate-500">Random batches + time-window scheduling + multi-payer pools</span>
      </div>

      <div className="card-body space-y-4">
        <div className="rounded-lg border border-indigo-800/40 bg-indigo-950/20 px-3 py-2 text-[11px] leading-relaxed text-indigo-200/80">
          Generates a time-based execution plan, then dispatches random-sized authorize batches across a fixed window.
          Each tx gets a semi-random amount inside your configured range, and successful authorizations can be captured
          after a random per-batch lag. You can feed multiple payer addresses to simulate a portfolio of users.
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div>
            <label className="label">Token</label>
            <select className="input" value={tokenAddr} onChange={e => setTokenAddr(e.target.value)}>
              {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
              {tokens.length === 0 && <option value="">No tokens loaded</option>}
            </select>
          </div>

          <div>
            <label className="label">Total txs</label>
            <input className="input" type="number" min={1} max={5000} value={totalTxs} onChange={e => setTotalTxs(e.target.value)} />
          </div>

          <div>
            <label className="label">Min amount ({token?.symbol ?? '—'})</label>
            <input className="input" type="number" min="0" step="0.01" value={minAmount} onChange={e => setMinAmount(e.target.value)} />
          </div>

          <div>
            <label className="label">Max amount ({token?.symbol ?? '—'})</label>
            <input className="input" type="number" min="0" step="0.01" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
          </div>

          <div>
            <label className="label">Duration (sec)</label>
            <input className="input" type="number" min={5} value={durationSec} onChange={e => setDurationSec(e.target.value)} />
          </div>

          <div>
            <label className="label">Min batch size</label>
            <input className="input" type="number" min={1} value={minBatchSize} onChange={e => setMinBatchSize(e.target.value)} />
          </div>

          <div>
            <label className="label">Max batch size</label>
            <input className="input" type="number" min={1} value={maxBatchSize} onChange={e => setMaxBatchSize(e.target.value)} />
          </div>

          <div>
            <label className="label">Distribution</label>
            <select className="input" value={distribution} onChange={e => setDistribution(e.target.value as Distribution)}>
              <option value="uniform">Uniform</option>
              <option value="frontloaded">Front-loaded</option>
              <option value="backloaded">Back-loaded</option>
              <option value="bursty">Bursty / clustered</option>
            </select>
          </div>

          <div>
            <label className="label">Capture ratio</label>
            <input className="input" type="number" min="0" max="1" step="0.05" value={captureRatio} onChange={e => setCaptureRatio(e.target.value)} />
          </div>

          <div>
            <label className="label">Max capture lag (sec)</label>
            <input className="input" type="number" min={0} value={maxCaptureLagSec} onChange={e => setMaxCaptureLagSec(e.target.value)} />
          </div>

          <div>
            <label className="label">Expires in (sec)</label>
            <input className="input" type="number" min={1} value={expiresIn} onChange={e => setExpiresIn(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label className="label">Payer pool (one address per line)</label>
            <textarea
              className="input min-h-28 font-mono text-[11px]"
              value={payerPoolText}
              onChange={e => setPayerPoolText(e.target.value)}
              placeholder="0x...\n0x..."
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Current valid payer count: <span className="text-slate-300">{payerPool.length}</span>. Each payer must already have deposited balance on core.
            </p>
          </div>

          <div>
            <label className="label">Merchant pool (optional, one per line)</label>
            <textarea
              className="input min-h-28 font-mono text-[11px]"
              value={merchantPoolText}
              onChange={e => setMerchantPoolText(e.target.value)}
              placeholder="Leave blank to auto-generate a unique merchant per tx"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              If blank, merchants are deterministically auto-generated so each tx can target a different recipient.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2 text-[11px] leading-relaxed text-yellow-200/80">
          Distinct addresses are supported at the <strong>payer</strong> and <strong>merchant</strong> level. The tx sender is still the currently connected relayer wallet,
          so if you later add more relayer private keys to the local account list, this scheduler can be extended to rotate actual senders too.
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded border border-white/5 bg-white/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan preview</span>
              <span className="text-[11px] text-slate-500">{preview.length} batches / {previewTxs} tx / ~{Math.round(previewDurationMs / 1000)}s</span>
            </div>

            <div className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]">
              {preview.slice(0, 18).map(batch => {
                const captureCount = batch.items.filter(item => item.capture).length
                return (
                  <div key={batch.batchId} className="flex items-center gap-3 rounded border border-white/5 bg-black/20 px-2 py-1.5 text-slate-300">
                    <span className="w-10 shrink-0 text-slate-500">#{batch.batchId}</span>
                    <span className="w-24 shrink-0">t+{(batch.offsetMs / 1000).toFixed(1)}s</span>
                    <span className="w-16 shrink-0">{batch.items.length} tx</span>
                    <span className="w-16 shrink-0 text-indigo-300">{captureCount} cap</span>
                    <span className="truncate text-slate-500">{shortenAddress(batch.items[0]?.user ?? TEST_ACCOUNTS[0].address)}</span>
                  </div>
                )
              })}
              {preview.length > 18 && (
                <p className="pt-1 text-slate-500">… {preview.length - 18} more batches</p>
              )}
            </div>
          </div>

          <div className="rounded border border-white/5 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Live stats</span>
              <span className={`text-[11px] ${phase === 'running' ? 'text-indigo-300' : phase === 'done' ? 'text-green-400' : phase === 'aborted' ? 'text-yellow-400' : 'text-slate-500'}`}>
                {phase}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded border border-white/5 bg-black/20 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Batches</p>
                <p className="font-mono text-sm text-white">{stats.dispatchedBatches}/{stats.plannedBatches}</p>
              </div>
              <div className="rounded border border-white/5 bg-black/20 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Elapsed</p>
                <p className="font-mono text-sm text-white">{(elapsedMs / 1000).toFixed(1)}s</p>
              </div>
              <div className="rounded border border-white/5 bg-black/20 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Authorize</p>
                <p className="font-mono text-sm"><span className="text-green-400">{stats.authOk}</span><span className="mx-1 text-slate-600">/</span><span className="text-red-400">{stats.authErr}</span></p>
              </div>
              <div className="rounded border border-white/5 bg-black/20 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Capture</p>
                <p className="font-mono text-sm"><span className="text-green-400">{stats.capOk}</span><span className="mx-1 text-slate-600">/</span><span className="text-red-400">{stats.capErr}</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={regeneratePlan} disabled={!token || phase === 'running'}>
            ↻ Regenerate plan
          </button>
          <button className="btn btn-primary" onClick={handleRun} disabled={!token || phase === 'running'}>
            ⚡ Run randomized stress test
          </button>
          {phase === 'running' && (
            <button
              className="btn btn-warning"
              onClick={() => {
                abortRef.current = true
                addEvent('info', 'Abort requested — scheduler will stop after the current in-flight work finishes.')
              }}
            >
              Abort
            </button>
          )}
        </div>

        {executions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border border-white/5 bg-white/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Batch executions</div>
              <div className="max-h-60 space-y-1 overflow-y-auto font-mono text-[11px]">
                {executions.slice().reverse().map(exec => (
                  <div key={exec.batchId} className="rounded border border-white/5 bg-black/20 px-2 py-1.5 text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-slate-500">#{exec.batchId}</span>
                      <span className="w-24">t+{exec.scheduledSec}s</span>
                      <span className="w-20 text-slate-500">real {exec.actualSec}s</span>
                      <span className={`ml-auto ${exec.driftMs > 1500 ? 'text-yellow-400' : 'text-slate-500'}`}>drift {exec.driftMs}ms</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                      <span>{exec.size} tx</span>
                      <span className="text-green-400">auth {exec.authOk}</span>
                      <span className="text-red-400">err {exec.authErr}</span>
                      <span className="text-indigo-300">cap {exec.capOk}</span>
                      {exec.capErr > 0 && <span className="text-red-400">cap err {exec.capErr}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-white/5 bg-white/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scheduler log</div>
              <div className="max-h-60 space-y-1 overflow-y-auto font-mono text-[11px]">
                {events.map(event => (
                  <div
                    key={event.id}
                    className={`rounded border px-2 py-1.5 ${
                      event.level === 'ok'
                        ? 'border-green-900/60 bg-green-950/20 text-green-300'
                        : event.level === 'error'
                          ? 'border-red-900/60 bg-red-950/20 text-red-300'
                          : 'border-white/5 bg-black/20 text-slate-400'
                    }`}
                  >
                    {event.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}