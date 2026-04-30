import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { shortenAddress } from '../lib/utils'

export function ConnectBar() {
  const { rpcUrl, coreAddress, blockNumber, isConnected, activeWalletIdx } = useAppStore()
  const { setRpcUrl, setCoreAddress } = useAppStore()
  const { connect } = useContractActions()

  const [localRpc,  setLocalRpc]  = useState(rpcUrl)
  const [localCore, setLocalCore] = useState(coreAddress)
  const [localUsdc, setLocalUsdc] = useState('')
  const [localWeth, setLocalWeth] = useState('')
  const [loading,   setLoading]   = useState(false)

  const handleConnect = async () => {
    if (!isAddress(localCore)) return
    setLoading(true)
    const tokens: Address[] = []
    if (isAddress(localUsdc)) tokens.push(localUsdc)
    if (isAddress(localWeth)) tokens.push(localWeth)
    await connect(localRpc, localCore, tokens)
    setLoading(false)
  }

  const acc = TEST_ACCOUNTS[activeWalletIdx]

  return (
    <div className="bg-surface border-b border-border px-4 py-2.5 flex flex-wrap items-center gap-3">
      {/* RPC */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 whitespace-nowrap">RPC</span>
        <input
          value={localRpc}
          onChange={e => setLocalRpc(e.target.value)}
          className="w-44"
          placeholder="http://127.0.0.1:8545"
        />
      </div>

      {/* Core */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 whitespace-nowrap">Core</span>
        <input
          value={localCore}
          onChange={e => setLocalCore(e.target.value)}
          className="w-52 font-mono"
          placeholder="0x…"
        />
      </div>

      {/* USDC */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">USDC</span>
        <input
          value={localUsdc}
          onChange={e => setLocalUsdc(e.target.value)}
          className="w-52 font-mono"
          placeholder="0x…"
        />
      </div>

      {/* WETH */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">WETH</span>
        <input
          value={localWeth}
          onChange={e => setLocalWeth(e.target.value)}
          className="w-52 font-mono"
          placeholder="0x…"
        />
      </div>

      <button
        onClick={handleConnect}
        disabled={loading}
        className="btn btn-primary ml-auto"
      >
        {loading ? '⏳ Connecting…' : 'Connect'}
      </button>

      {/* Status pills */}
      {isConnected && (
        <>
          <span className="text-[11px] bg-surface2 border border-border rounded-full px-2.5 py-0.5 text-green-400">
            ● Connected
          </span>
          <span className="text-[11px] bg-surface2 border border-border rounded-full px-2.5 py-0.5 text-slate-400">
            Block <strong className="text-slate-200">{blockNumber.toString()}</strong>
          </span>
          <span className="text-[11px] bg-surface2 border border-border rounded-full px-2.5 py-0.5 text-accent2">
            Wallet: <strong>{acc.name}</strong>{' '}
            <span className="text-slate-500">{shortenAddress(acc.address)}</span>
          </span>
        </>
      )}
    </div>
  )
}
