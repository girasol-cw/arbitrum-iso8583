import { useAppStore } from '../store'
import type { LogLevel } from '../store'

const LEVEL_STYLE: Record<LogLevel, string> = {
  info:  'text-indigo-400',
  ok:    'text-green-400',
  error: 'text-red-400',
}

const LEVEL_PREFIX: Record<LogLevel, string> = {
  info:  '○',
  ok:    '✓',
  error: '✗',
}

export function TxLog() {
  const { logs, clearLogs } = useAppStore()

  return (
    <div className="card mt-5">
      <div className="card-header">
        <h3 className="text-sm font-semibold flex-1">📋 Transaction Log</h3>
        <span className="text-[11px] text-slate-500 mr-3">{logs.length} entries</span>
        <button className="btn btn-ghost text-[11px] py-0.5 px-2" onClick={clearLogs}>
          Clear
        </button>
      </div>
      <div className="p-3 max-h-56 overflow-y-auto space-y-1 font-mono text-[11px]">
        {logs.length === 0 && (
          <span className="text-slate-600">No transactions yet. Connect to Anvil and start testing.</span>
        )}
        {[...logs].reverse().map(l => (
          <div key={l.id} className="flex gap-3 items-start">
            <span className="text-slate-600 shrink-0">{l.ts}</span>
            <span className={`shrink-0 ${LEVEL_STYLE[l.level]}`}>{LEVEL_PREFIX[l.level]}</span>
            <span className={`break-all ${LEVEL_STYLE[l.level]}`}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
