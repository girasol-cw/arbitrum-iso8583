import { useEffect } from 'react'
import { useContractActions } from './hooks/useContractActions'
import { useAppStore } from './store'
import { DEPLOYED, ARBITRUM_SEPOLIA_RPC } from './lib/contracts'
import { isAddress } from 'viem'
import type { Address } from 'viem'
import { AccountCard }    from './components/AccountCard'
import { DepositPanel }   from './components/DepositPanel'
import { PaymentsPanel }  from './components/PaymentsPanel'
import { AdminPanel }     from './components/AdminPanel'
import { QueryPanel }     from './components/QueryPanel'
import { ActivityFeed }   from './components/ActivityFeed'
import { AddTokenPanel }  from './components/AddTokenPanel'
import { BatchOpsPanel }  from './components/BatchOpsPanel'
import { BurstOpsPanel }  from './components/BurstOpsPanel'
import { BenchmarkPanel } from './components/BenchmarkPanel'

export default function App() {
  const { connect } = useContractActions()
  const { isConnected, isPaused, blockNumber } = useAppStore()

  // Auto-connect on mount
  useEffect(() => {
    const tokens: Address[] = []
    if (isAddress(DEPLOYED.usdc)) tokens.push(DEPLOYED.usdc)
    if (isAddress(DEPLOYED.weth)) tokens.push(DEPLOYED.weth as Address)
    connect(ARBITRUM_SEPOLIA_RPC, DEPLOYED.proxy, tokens)
  }, [])

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 flex flex-col">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="border-b border-white/5 bg-[#161b22] px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-lg">◆</span>
          <span className="font-bold text-white text-sm tracking-wide">Settlement Core</span>
          <a
            href={`https://sepolia.arbiscan.io/address/${DEPLOYED.proxy}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono text-slate-500 hover:text-indigo-400 transition-colors"
          >
            {DEPLOYED.proxy.slice(0, 8)}…{DEPLOYED.proxy.slice(-6)}
          </a>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          {/* Network */}
          <span className="px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
            Arbitrum Sepolia
          </span>

          {/* Contract status */}
          {isConnected && (
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${
              isPaused
                ? 'bg-red-950 text-red-300 border-red-800'
                : 'bg-green-950 text-green-300 border-green-800'
            }`}>
              {isPaused ? '⛔ Paused' : '● Live'}
            </span>
          )}

          {/* Block */}
          {isConnected && (
            <span className="text-slate-500">
              Block <span className="text-slate-300 font-mono">{blockNumber.toString()}</span>
            </span>
          )}

          {/* Connection state */}
          <span className={`px-2.5 py-1 rounded-full border ${
            isConnected
              ? 'bg-green-950 text-green-400 border-green-900'
              : 'bg-yellow-950 text-yellow-400 border-yellow-900 animate-pulse'
          }`}>
            {isConnected ? 'Connected' : 'Connecting…'}
          </span>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-5 space-y-4">

        {/* Row 1: Account full width */}
        <AccountCard />

        {/* Row 2: Deposit | Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DepositPanel />
          <PaymentsPanel />
        </div>

        {/* Row 3: Admin | Query */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AdminPanel />
          <QueryPanel />
        </div>

        {/* Row 4: Custom Token */}
        <AddTokenPanel />

        {/* Row 5: Batch | Burst */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BatchOpsPanel />
          <BurstOpsPanel />
        </div>

        {/* Row 6: Benchmark */}
        <BenchmarkPanel />

        {/* Row 7: Activity Feed */}
        <ActivityFeed />

      </main>
    </div>
  )
}

