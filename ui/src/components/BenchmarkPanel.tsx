import { useState } from 'react'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import type { BenchmarkEntry } from '../store'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function avg(arr: number[]): number {
  if (!arr.length) return 0
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function p95(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]
}

function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`
  if (ms >= 1_000)  return `${(ms / 1000).toFixed(2)}s`
  return `${ms}ms`
}

function fmtGas(gas: bigint): string {
  if (gas >= 1_000_000n) return `${(Number(gas) / 1_000_000).toFixed(2)}M`
  if (gas >= 1_000n)     return `${(Number(gas) / 1_000).toFixed(1)}k`
  return gas.toString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color = 'indigo',
}: {
  label: string
  value: string
  sub?: string
  color?: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose'
}) {
  const colors: Record<string, string> = {
    indigo:  'border-indigo-800/60 bg-indigo-950/40 text-indigo-300',
    emerald: 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300',
    amber:   'border-amber-800/60  bg-amber-950/40  text-amber-300',
    sky:     'border-sky-800/60    bg-sky-950/40    text-sky-300',
    rose:    'border-rose-800/60   bg-rose-950/40   text-rose-300',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-col gap-1 ${colors[color]}`}>
      <span className="text-[10px] uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-xl font-bold font-mono">{value}</span>
      {sub && <span className="text-[10px] opacity-60">{sub}</span>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Action filter button
// ─────────────────────────────────────────────────────────────────────────────
function FilterBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
        active
          ? 'bg-indigo-700 border-indigo-500 text-white'
          : 'bg-white/5 border-white/10 text-slate-400 hover:border-indigo-700'
      }`}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function BenchmarkPanel() {
  const { benchmarks, rpcLatencyMs } = useAppStore()
  const { measureRpcLatency } = useContractActions()
  const [filter, setFilter]   = useState<string>('all')
  const [pinging, setPinging] = useState(false)

  // Derive unique actions for filter pills
  const actions = ['all', ...Array.from(new Set(benchmarks.map(b => b.action)))]

  const filtered: BenchmarkEntry[] =
    filter === 'all' ? benchmarks : benchmarks.filter(b => b.action === filter)

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const submitTimes  = filtered.map(b => b.submitMs)
  const confirmTimes = filtered.map(b => b.confirmMs)
  const totalTimes   = filtered.map(b => b.totalMs)
  const gasValues    = filtered.map(b => Number(b.gasUsed))

  const avgTotal   = avg(totalTimes)
  const medTotal   = median(totalTimes)
  const p95Total   = p95(totalTimes)
  const avgSubmit  = avg(submitTimes)
  const avgConfirm = avg(confirmTimes)
  const avgGas     = avg(gasValues)
  const minGas     = gasValues.length ? Math.min(...gasValues) : 0
  const maxGas     = gasValues.length ? Math.max(...gasValues) : 0

  // Success rate (all tracked txs are successful, but keep it visible)
  const total = benchmarks.length

  // ── Ping handler ─────────────────────────────────────────────────────────
  const handlePing = async () => {
    setPinging(true)
    await measureRpcLatency()
    setPinging(false)
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-[#161b22] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="font-semibold text-sm text-white">Benchmark</span>
          <span className="text-[11px] text-slate-500">
            {total} tx{total !== 1 ? 's' : ''} registradas
          </span>
        </div>

        {/* RPC Latency + ping */}
        <div className="flex items-center gap-3">
          {rpcLatencyMs !== null && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
              rpcLatencyMs < 200
                ? 'text-emerald-300 border-emerald-800 bg-emerald-950/50'
                : rpcLatencyMs < 600
                ? 'text-amber-300 border-amber-800 bg-amber-950/50'
                : 'text-rose-300 border-rose-800 bg-rose-950/50'
            }`}>
              RPC {rpcLatencyMs}ms
            </span>
          )}

          <button
            onClick={handlePing}
            disabled={pinging}
            className="text-[11px] px-3 py-1 rounded-lg bg-white/5 border border-white/10
                       hover:border-indigo-700 text-slate-300 disabled:opacity-40 transition-colors"
          >
            {pinging ? 'Pinging…' : '⚡ Ping RPC'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Avg total"
            value={total ? fmtMs(avgTotal) : '—'}
            sub="submit + confirm"
            color="indigo"
          />
          <StatCard
            label="Median total"
            value={total ? fmtMs(medTotal) : '—'}
            sub="p50"
            color="sky"
          />
          <StatCard
            label="p95 total"
            value={total ? fmtMs(p95Total) : '—'}
            sub="95th percentile"
            color="amber"
          />
          <StatCard
            label="Avg submit"
            value={total ? fmtMs(avgSubmit) : '—'}
            sub="hasta hash"
            color="emerald"
          />
          <StatCard
            label="Avg confirm"
            value={total ? fmtMs(avgConfirm) : '—'}
            sub="hash → receipt"
            color="emerald"
          />
          <StatCard
            label="Avg gas"
            value={total ? fmtGas(BigInt(avgGas)) : '—'}
            sub={total ? `min ${fmtGas(BigInt(minGas))} / max ${fmtGas(BigInt(maxGas))}` : undefined}
            color="rose"
          />
        </div>

        {total === 0 ? (
          <div className="text-center py-12 text-slate-600 text-sm">
            Run transactions to start accumulating metrics.
          </div>
        ) : (
          <>
            {/* ── Filter pills ──────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              {actions.map(a => (
                <FilterBtn
                  key={a}
                  label={a === 'all' ? 'All' : a}
                  active={filter === a}
                  onClick={() => setFilter(a)}
                />
              ))}
            </div>

            {/* ── Per-action summary ────────────────────────────────────── */}
            {filter === 'all' && (
              <div className="overflow-x-auto rounded-xl border border-white/8">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/4 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-right">Count</th>
                      <th className="px-3 py-2 text-right">Avg total</th>
                      <th className="px-3 py-2 text-right">Avg submit</th>
                      <th className="px-3 py-2 text-right">Avg confirm</th>
                      <th className="px-3 py-2 text-right">Avg gas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Array.from(new Set(benchmarks.map(b => b.action))).map(action => {
                      const rows = benchmarks.filter(b => b.action === action)
                      return (
                        <tr key={action} className="hover:bg-white/3 transition-colors">
                          <td className="px-3 py-2 font-mono text-indigo-300">{action}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{rows.length}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtMs(avg(rows.map(r => r.totalMs)))}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmtMs(avg(rows.map(r => r.submitMs)))}</td>
                          <td className="px-3 py-2 text-right font-mono text-sky-400">{fmtMs(avg(rows.map(r => r.confirmMs)))}</td>
                          <td className="px-3 py-2 text-right font-mono text-rose-400">{fmtGas(BigInt(avg(rows.map(r => Number(r.gasUsed)))))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Recent tx table ───────────────────────────────────────── */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">
                Recent transactions {filter !== 'all' ? `· ${filter}` : ''}
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/8 max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#161b22] z-10">
                    <tr className="text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-right">Submit</th>
                      <th className="px-3 py-2 text-right">Confirm</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Gas</th>
                      <th className="px-3 py-2 text-right">Block</th>
                      <th className="px-3 py-2 text-left">Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map(b => (
                      <tr key={b.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{b.ts}</td>
                        <td className="px-3 py-1.5 font-mono text-indigo-300">{b.action}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-400 whitespace-nowrap">
                          {fmtMs(b.submitMs)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-sky-400 whitespace-nowrap">
                          {fmtMs(b.confirmMs)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold whitespace-nowrap ${
                          b.totalMs < 5_000  ? 'text-emerald-300' :
                          b.totalMs < 15_000 ? 'text-amber-300' :
                                               'text-rose-300'
                        }`}>
                          {fmtMs(b.totalMs)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-rose-400">
                          {fmtGas(b.gasUsed)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                          {b.blockNumber.toString()}
                        </td>
                        <td className="px-3 py-1.5">
                          <a
                            href={`https://sepolia.arbiscan.io/tx/${b.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-slate-500 hover:text-indigo-400 transition-colors"
                          >
                            {b.hash.slice(0, 10)}…{b.hash.slice(-6)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
