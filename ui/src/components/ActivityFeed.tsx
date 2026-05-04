import type { Hex } from 'viem'
import { useAppStore } from '../store'

const ARBISCAN = 'https://sepolia.arbiscan.io'

export function ActivityFeed() {
  const { txHistory, logs, clearLogs } = useAppStore()

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Activity Feed</span>
        <span className="ml-auto text-[11px] text-slate-500 mr-3">
          {txHistory.length} transactions · {logs.filter(l => l.level === 'error').length} errors
        </span>
        <button className="btn btn-ghost text-[11px] py-0.5 px-2" onClick={clearLogs}>
          Clear
        </button>
      </div>

      <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
        {/* Transactions with Arbiscan links */}
        {txHistory.map(tx => (
          <div key={tx.id} className="px-4 py-2.5 flex items-center gap-4 hover:bg-white/[0.02]">
            <span className="text-slate-600 text-[11px] font-mono shrink-0">{tx.ts}</span>
            <span className="text-green-400 text-[11px] shrink-0">✓</span>
            <span className="text-slate-300 text-xs font-semibold shrink-0">{tx.action}</span>
            {tx.gas != null && (
              <span className="text-[11px] text-slate-600 shrink-0">{tx.gas.toString()} gas</span>
            )}
            <a
              href={`${ARBISCAN}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto font-mono text-indigo-400 hover:text-indigo-300 text-[11px] hover:underline shrink-0 flex items-center gap-1"
            >
              {tx.hash.slice(0, 14)}…{tx.hash.slice(-6)}
              <span className="text-slate-600">↗</span>
            </a>
          </div>
        ))}

        {/* Error / info logs */}
        {logs.filter(l => l.level === 'error').map(l => (
          <div key={l.id} className="px-4 py-2 flex items-start gap-4 hover:bg-white/[0.02]">
            <span className="text-slate-600 text-[11px] font-mono shrink-0">{l.ts}</span>
            <span className="text-red-400 text-[11px] shrink-0">✗</span>
            <span className="text-red-400 text-[11px] font-mono break-all">{l.msg}</span>
          </div>
        ))}

        {txHistory.length === 0 && logs.filter(l => l.level === 'error').length === 0 && (
          <p className="px-4 py-5 text-[12px] text-slate-600">
            No activity yet. Send a transaction to see it here.
          </p>
        )}
      </div>
    </div>
  )
}

// re-export type so importing files don't need to import separately
export type { Hex }
