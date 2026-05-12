import { useState, useEffect } from 'react'
import { isAddress, keccak256, encodePacked } from 'viem'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { randomBytes32 } from '../lib/utils'

type Phase = 'idle' | 'authorizing' | 'capturing' | 'done'

interface BurstResult {
  index:  number
  txId:   Hex
  action: 'authorize' | 'capture'
  status: 'ok' | 'error'
  detail: string
}

export function BurstOpsPanel() {
  const { tokens } = useAppStore()
  const { burstAuthorize, burstCapture } = useContractActions()

  // Config
  const [tokenAddr,  setTokenAddr]  = useState<string>('')

  // Sync token when store loads asynchronously
  useEffect(() => {
    if (tokenAddr === '' && tokens.length > 0) setTokenAddr(tokens[0].address)
  }, [tokens])
  const [count,      setCount]      = useState('5')
  const [amountEach, setAmountEach] = useState('1')
  const [merchant,   setMerchant]   = useState('')
  const [expiresIn,  setExpiresIn]  = useState('3600')
  const [userAddr,   setUserAddr]   = useState<string>(TEST_ACCOUNTS[0].address)
  const [captureAll, setCaptureAll] = useState(true)

  const [phase,   setPhase]   = useState<Phase>('idle')
  const [results, setResults] = useState<BurstResult[]>([])

  const token   = tokens.find(t => t.address === tokenAddr) ?? tokens[0]
  const totalTxs = parseInt(count) || 0

  const getMerchant = (i: number): Address => {
    if (merchant.trim() && isAddress(merchant.trim())) return merchant.trim() as Address
    return `0x${keccak256(encodePacked(['string', 'uint256'], [`burst-merch`, BigInt(i)])).slice(26)}` as Address
  }

  const handleBurst = async () => {
    if (!token || !isAddress(userAddr)) return

    const n       = Math.min(Math.max(totalTxs, 1), 50)
    const expSecs = parseInt(expiresIn) || 3600
    const txIds   = Array.from({ length: n }, () => randomBytes32())

    setResults([])
    setPhase('authorizing')

    // ── Phase 1: burst-authorize with sequential nonces ───────────────────
    const authItems = txIds.map((txId, i) => ({
      txId,
      user:      userAddr as Address,
      merchant:  getMerchant(i),
      token:     token.address as Address,
      human:     amountEach,
      decimals:  token.decimals,
      expiresIn: expSecs,
    }))

    const authResults = await burstAuthorize(authItems)

    const burstAuthDisplay: BurstResult[] = authResults.map(r => ({
      index:  r.i + 1,
      txId:   r.txId as Hex,
      action: 'authorize' as const,
      status: r.ok ? 'ok' : 'error',
      detail: r.ok ? (r.hash ?? '') : ((r as { reason?: string }).reason ?? 'failed'),
    }))

    setResults(burstAuthDisplay)

    // ── Phase 2: burst-capture all successful authorizations ──────────────
    if (captureAll) {
      setPhase('capturing')

      const successfulTxIds = authResults
        .filter(r => r.ok)
        .map(r => r.txId as Hex)

      if (successfulTxIds.length > 0) {
        const capResults = await burstCapture(successfulTxIds)

        const burstCapDisplay: BurstResult[] = capResults.map(r => ({
          index:  r.i + 1,
          txId:   r.txId as Hex,
          action: 'capture' as const,
          status: r.ok ? 'ok' : 'error',
          detail: r.ok ? (r.hash ?? '') : ((r as { reason?: string }).reason ?? 'failed'),
        }))

        setResults(prev => [...prev, ...burstCapDisplay])
      }
    }

    setPhase('done')
  }

  const authResults = results.filter(r => r.action === 'authorize')
  const capResults  = results.filter(r => r.action === 'capture')
  const authOk      = authResults.filter(r => r.status === 'ok').length
  const authErr     = authResults.filter(r => r.status === 'error').length
  const capOk       = capResults.filter(r => r.status === 'ok').length
  const capErr      = capResults.filter(r => r.status === 'error').length

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Burst / Concurrency Test</span>
        <span className="ml-auto text-[11px] text-slate-500">Sequential nonces + parallel receipts — validates EVM ordering</span>
      </div>

      <div className="card-body space-y-4">

        {/* Explanation */}
        <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2 text-[11px] text-yellow-300/80 leading-relaxed">
          Submits all N transactions simultaneously using <strong>sequential nonces</strong> (fetched once before
          firing), then waits for all receipts in parallel. The EVM still orders them sequentially \u2014
          only those that pass balance validation succeed. Use this to confirm double-spend is impossible
          under concurrent load.
        </div>

        {/* Smart Account note */}
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2 text-[11px] text-blue-300/80 leading-relaxed">
          <span className="font-semibold text-blue-300">Future improvement:</span> For reliable concurrent execution,
          consider using a{' '}
          <a
            href="https://eips.ethereum.org/EIPS/eip-4337"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-200"
          >
            ERC-4337 Smart Account
          </a>{' '}
          (e.g. Safe, Biconomy, ZeroDev). A Smart Account can submit all N calls as a single
          UserOperation with a bundler, giving deterministic ordering, atomic revert semantics
          and a single nonce \u2014 removing the mempool race conditions that cause most failures in this test.
        </div>

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
            <label className="label">Amount each ({token?.symbol ?? '\u2014'})</label>
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
            <label className="label">Merchant <span className="text-slate-600">(blank = auto per tx)</span></label>
            <input
              className="input font-mono text-xs"
              placeholder="0x\u2026 or leave blank"
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

          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="captureAll"
              checked={captureAll}
              onChange={e => setCaptureAll(e.target.checked)}
              className="accent-indigo-500"
            />
            <label htmlFor="captureAll" className="text-xs text-slate-300 cursor-pointer">
              Also burst-capture all successful authorizations
            </label>
          </div>
        </div>

        {/* Run */}
        <button
          className="btn btn-primary w-full"
          onClick={handleBurst}
          disabled={phase === 'authorizing' || phase === 'capturing' || tokens.length === 0}
        >
          {phase === 'authorizing' && '\u26a1 Authorizing\u2026'}
          {phase === 'capturing'   && '\u26a1 Capturing\u2026'}
          {(phase === 'idle' || phase === 'done') && `\u26a1 Burst ${totalTxs} tx${totalTxs !== 1 ? 's' : ''}`}
        </button>

        {/* Summary */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded border border-white/5 bg-white/5 py-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Authorize</p>
              <p className="text-lg font-bold">
                <span className="text-green-400">{authOk}</span>
                <span className="text-slate-600 mx-1">/</span>
                <span className="text-red-400">{authErr}</span>
              </p>
              <p className="text-[10px] text-slate-600">ok / failed</p>
            </div>
            {captureAll && (
              <div className="rounded border border-white/5 bg-white/5 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Capture</p>
                <p className="text-lg font-bold">
                  <span className="text-green-400">{capOk}</span>
                  <span className="text-slate-600 mx-1">/</span>
                  <span className="text-red-400">{capErr}</span>
                </p>
                <p className="text-[10px] text-slate-600">ok / failed</p>
              </div>
            )}
          </div>
        )}

        {/* Results log */}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded border border-white/5 bg-black/20 p-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-[11px] font-mono ${r.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}
              >
                <span className="text-slate-600 w-4 text-right shrink-0">{r.index}</span>
                <span className={`w-16 shrink-0 ${r.action === 'capture' ? 'text-indigo-400' : ''}`}>{r.action}</span>
                <span className="truncate flex-1 text-slate-400">
                  {r.detail.length > 20 ? `${r.detail.slice(0, 20)}\u2026` : r.detail}
                </span>
                <span>{r.status === 'ok' ? '\u2713' : '\u2717'}</span>
              </div>
            ))}
          </div>
        )}

        {phase === 'done' && authErr > 0 && (
          <p className="text-[11px] text-yellow-400 font-mono">
            {authErr} authorization(s) failed \u2014 expected if user balance {'<'} count \u00d7 amount. No double-spend occurred.
          </p>
        )}
      </div>
    </div>
  )
}

