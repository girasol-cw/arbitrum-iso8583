import { useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { formatToken, timestampStr } from '../lib/utils'
import { HOLD_STATUS_LABELS } from '../lib/accounts'

interface HoldResult {
  user:      Address
  merchant:  Address
  token:     Address
  amount:    bigint
  createdAt: bigint
  expiresAt: bigint
  status:    number
}

export function QueryPanel() {
  const { tokens } = useAppStore()
  const { queryBalance, queryHold } = useContractActions()

  // Balance query
  const [balUser,   setBalUser]   = useState(TEST_ACCOUNTS[0].address)
  const [balToken,  setBalToken]  = useState('')
  const [balResult, setBalResult] = useState<{ available: bigint; locked: bigint } | null>(null)
  const [balErr,    setBalErr]    = useState('')

  // Hold query
  const [holdId,     setHoldId]     = useState('')
  const [holdResult, setHoldResult] = useState<HoldResult | null>(null)
  const [holdErr,    setHoldErr]    = useState('')

  const tkn = (addr: string) => tokens.find(t => t.address.toLowerCase() === addr.toLowerCase())

  const handleBalance = async () => {
    if (!balUser || !balToken) return
    setBalResult(null); setBalErr('')
    const res = await queryBalance(balUser as Address, balToken as Address)
    if (res) setBalResult(res as { available: bigint; locked: bigint })
    else setBalErr('Query failed — check Activity Feed')
  }

  const handleHold = async () => {
    if (!holdId.trim()) return
    setHoldResult(null); setHoldErr('')
    const res = await queryHold(holdId.trim() as Hex)
    if (res) setHoldResult(res as HoldResult)
    else setHoldErr('Query failed — check Activity Feed')
  }

  const t  = tkn(balToken || '')
  const ht = holdResult ? tkn(holdResult.token) : null

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Queries</span>
        <span className="ml-auto text-[11px] text-slate-500">Read-only · no gas</span>
      </div>

      <div className="card-body space-y-5">

        {/* ── Balance ─────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
            Contract balance for address
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Address</label>
              <input
                value={balUser}
                onChange={e => setBalUser(e.target.value)}
                className="font-mono"
                placeholder="0x…"
              />
            </div>
            <div>
              <label className="label">Token</label>
              <select value={balToken} onChange={e => setBalToken(e.target.value)}>
                <option value="">— select —</option>
                {tokens.map(tok => <option key={tok.address} value={tok.address}>{tok.symbol}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={handleBalance}>Query Balance</button>

          {balErr && <p className="text-xs text-red-400 mt-2">{balErr}</p>}
          {balResult && (
            <div className="mt-3 bg-[#0d1117] rounded-lg p-3 space-y-1 border border-white/5">
              <InfoRow label="Available" value={t ? `${formatToken(balResult.available, t.decimals)} ${t.symbol}` : balResult.available.toString()} />
              <InfoRow label="Locked"    value={t ? `${formatToken(balResult.locked,    t.decimals)} ${t.symbol}` : balResult.locked.toString()} />
            </div>
          )}
        </div>

        <hr className="border-white/5" />

        {/* ── Hold ────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
            Look up payment hold
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">Payment ID (bytes32)</label>
              <input value={holdId} onChange={e => setHoldId(e.target.value)} placeholder="0x…" />
            </div>
            <button className="btn btn-ghost" onClick={handleHold}>Look up</button>
          </div>

          {holdErr && <p className="text-xs text-red-400 mt-2">{holdErr}</p>}
          {holdResult && (
            <div className="mt-3 bg-[#0d1117] rounded-lg p-3 space-y-1 border border-white/5 text-xs">
              <InfoRow
                label="Status"
                value={HOLD_STATUS_LABELS[holdResult.status] ?? String(holdResult.status)}
                highlight={
                  holdResult.status === 1 ? 'text-yellow-400'
                    : holdResult.status === 2 ? 'text-green-400'
                    : holdResult.status === 3 ? 'text-blue-400'
                    : holdResult.status === 4 ? 'text-slate-500'
                    : undefined
                }
              />
              <InfoRow
                label="Amount"
                value={ht
                  ? `${formatToken(holdResult.amount, ht.decimals)} ${ht.symbol}`
                  : holdResult.amount.toString()}
              />
              <AddrRow label="User"     addr={holdResult.user} />
              <AddrRow label="Merchant" addr={holdResult.merchant} />
              <InfoRow label="Created" value={timestampStr(holdResult.createdAt)} />
              <InfoRow label="Expires" value={timestampStr(holdResult.expiresAt)} />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`font-mono text-right truncate ${highlight ?? 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

function AddrRow({ label, addr }: { label: string; addr: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <a
        href={`https://sepolia.arbiscan.io/address/${addr}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-indigo-400 hover:underline text-right truncate"
      >
        {addr.slice(0, 10)}…{addr.slice(-8)}
      </a>
    </div>
  )

}
