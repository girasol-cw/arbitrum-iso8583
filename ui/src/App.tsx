import { ConnectBar } from './components/ConnectBar'
import { Sidebar } from './components/Sidebar'
import { TokenAdminPanel } from './components/TokenAdminPanel'
import { UserActionsPanel } from './components/UserActionsPanel'
import { RelayerActionsPanel } from './components/RelayerActionsPanel'
import { ExpirePanel } from './components/ExpirePanel'
import { PausePanel } from './components/PausePanel'
import { QueryPanel } from './components/QueryPanel'
import { TxLog } from './components/TxLog'

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">

      {/* Top header */}
      <header className="bg-surface border-b border-border px-5 py-3 flex items-center gap-3 shrink-0">
        <span className="text-accent2 font-bold text-base">⚙</span>
        <h1 className="font-bold text-sm text-accent2 tracking-wide">
          ArbitrumSettlementCore
        </h1>
        <span className="text-[11px] text-slate-500 bg-surface2 border border-border rounded-full px-2.5 py-0.5">
          Test UI
        </span>
        <span className="text-[11px] text-slate-500 bg-surface2 border border-border rounded-full px-2.5 py-0.5">
          React + Vite + viem
        </span>
      </header>

      {/* Connect bar */}
      <ConnectBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <Sidebar />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TokenAdminPanel />
            <UserActionsPanel />
            <RelayerActionsPanel />
            <div className="space-y-4">
              <ExpirePanel />
              <PausePanel />
            </div>
            <QueryPanel />
          </div>

          <TxLog />
        </main>

      </div>
    </div>
  )
}
