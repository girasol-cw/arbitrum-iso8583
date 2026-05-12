import { useState, useRef, useEffect } from 'react'
import { isAddress, keccak256, encodePacked } from 'viem'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { randomBytes32 } from '../lib/utils'

type Mode = 'authorize' | 'authorize+capture'

interface TxResult {
  index:   number
  txId:    Hex
  status:  'ok' | 'error'
  action:  string
  detail:  string
}

export function BatchOpsPanel() {
  const { tokens } = useAppStore()
  const { batchRun } = useContractActions()

  // Config
  const [tokenAddr,  setTokenAddr]  = useState<string>('')
  const [count,      setCount]      = useState('5')
  const [amountEach, setAmountEach] = useState('1')
  const [merchant,   setMerchant]   = useState('')
  const [expiresIn,  setExpiresIn]  = useState('3600')
  const [userAddr,   setUserAddr]   = useState<string>(TEST_ACCOUNTS[0].address)
  const [mode,       setMode]       = useState<Mode>('authorize+capture')

  // State
  const [running,   setRunning]   = useState(false)
  const [results,   setResults]   = useState<TxResult[]>([])
  const [progress,  setProgress]  = useState(0)
  const abortRef = useRef(false)

  // Sync token when store loads asynchronously
  useEffect(() => {
    if (tokenAddr === '' && tokens.length > 0) setTokenAddr(tokens[0].address)
  }, [tokens])

  const totalTxs = parseInt(count) || 0
  const token = tokens.find(t => t.address === tokenAddr) ?? tokens[0]

  // Derive merchant: if blank, use a deterministic address per-tx
  const getMerchant = (i: number): Address => {
    if (merchant.trim() && isAddress(merchant.trim())) return merchant.trim() as Address
    // deterministic fake merchant per index
    return `0x${keccak256(encodePacked(['string', 'uint256'], [`merchant`, BigInt(i)])).slice(26)}` as Address
  }

  const handleRun = async () => {
    if (!token) return
    if (!isAddress(userAddr)) return

    abortRef.current = false
    setRunning(true)
    setResults([])
    setProgress(0)

    const n       = Math.min(Math.max(totalTxs, 1), 50)
    const expSecs = parseInt(expiresIn) || 3600

    const items = Array.from({ length: n }, (_, i) => ({
      txId:      randomBytes32(),
      user:      userAddr as Address,
      merchant:  getMerchant(i),
      token:     token.address as Address,
      human:     amountEach,
      decimals:  token.decimals,
      expiresIn: expSecs,
    }))

    await batchRun(
      items,
      mode,
      (result) => {
        setResults(r => [...r, result])
        if (result.action === 'authorize') setProgress(p => p + 1)
      },
      () => abortRef.current,
    )

    setRunning(false)
  }

  const okCount    = results.filter(r => r.status === 'ok').length
  const errCount   = results.filter(r => r.status === 'error').length
  const pct        = totalTxs > 0 ? Math.round((progress / totalTxs) * 100) : 0

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Batch Operations</span>
        <span className="ml-auto text-[11px] text-slate-500">Sequential — authorize / capture N transactions</span>
      </div>

      <div className="card-body space-y-4">

        {/* Config grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Token</label>
            <select className="input" value={tokenAddr} onChange={e => setTokenAddr(e.target.value)}>
              {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
              {tokens.length === 0 && <option value="">No tokens loaded</option>}
            </select>
          </div>

          <div>
            <label className="label">Count (max 50)</label>
            <input
              className="input"
              type="number" min={1} max={50}
              value={count}
              onChange={e => setCount(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Amount each ({token?.symbol ?? '—'})</label>
            <input
              className="input"
              type="number" step="any" min="0"
              value={amountEach}
              onChange={e => setAmountEach(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Expires in (sec)</label>
            <input
              className="input"
              type="number" min={1}
              value={expiresIn}
              onChange={e => setExpiresIn(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="label">Merchant address <span className="text-slate-600">(blank = auto per tx)</span></label>
            <input
              className="input font-mono text-xs"
              placeholder="0x… or leave blank"
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="label">User (payer)</label>
            <input
              className="input font-mono text-xs"
              value={userAddr}
              onChange={e => setUserAddr(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="label">Mode</label>
            <select className="input" value={mode} onChange={e => setMode(e.target.value as Mode)}>
              <option value="authorize">Authorize only</option>
              <option value="authorize+capture">Authorize + Capture</option>
            </select>
          </div>
        </div>

        {/* Smart Account note */}
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2 text-[11px] text-blue-300/80 leading-relaxed">
          <span className="font-semibold text-blue-300">Future improvement:</span> For true atomic batch execution,
          consider using a{' '}
          <a
            href="https://eips.ethereum.org/EIPS/eip-4337"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-200"
          >
            ERC-4337 Smart Account
          </a>{' '}
          (e.g. Safe, Biconomy, ZeroDev). A Smart Account can bundle all N
          <code className="mx-1 px-1 bg-white/10 rounded">authorize</code> calls into a single
          UserOperation, guaranteeing atomicity, a single gas payment and consistent nonce
          ordering — eliminating the mempool ordering uncertainty present in this sequential approach.
        </div>

        {/* Run / Abort */}
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={handleRun}
            disabled={running || tokens.length === 0}
          >
            {running ? `Running… ${progress}/${totalTxs}` : `Run ${totalTxs} tx${totalTxs !== 1 ? 's' : ''}`}
          </button>
          {running && (
            <button className="btn btn-warning" onClick={() => { abortRef.current = true }}>
              Abort
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(running || progress > 0) && (
          <div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>{progress} / {totalTxs}</span>
              <span className="text-green-400">{okCount} ok</span>
              <span className={errCount > 0 ? 'text-red-400' : 'text-slate-600'}>{errCount} failed</span>
            </div>
          </div>
        )}

        {/* Results log */}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded border border-white/5 bg-black/20 p-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 text-[11px] font-mono ${r.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                <span className="text-slate-600 w-5 text-right">{r.index}</span>
                <span className="w-14 shrink-0">{r.action}</span>
                <span className="truncate flex-1 text-slate-400">{r.detail.slice(0, 20)}…</span>
                <span>{r.status === 'ok' ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
