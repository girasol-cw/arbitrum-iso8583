import { useState } from 'react'
import type { Address } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'

type Status = 'idle' | 'pending' | 'ok' | 'error'

function useStatus() {
  const [status, setStatus] = useState<Status>('idle')
  const [msg,    setMsg]    = useState('')
  return {
    status, msg,
    pending: (m = 'Sending transaction…') => { setStatus('pending'); setMsg(m) },
    ok:      (m: string)                   => { setStatus('ok');      setMsg(m) },
    error:   (m: string)                   => { setStatus('error');   setMsg(m) },
    reset:   ()                             => { setStatus('idle');   setMsg('') },
  }
}

function StatusRow({ status, msg }: { status: Status; msg: string }) {
  if (!msg) return null
  const colors: Record<Status, string> = {
    idle:    'text-slate-500',
    pending: 'text-yellow-400',
    ok:      'text-green-400',
    error:   'text-red-400',
  }
  const prefix: Record<Status, string> = {
    idle: '', pending: '⏳', ok: '✓', error: '✗'
  }
  return (
    <p className={`text-xs mt-2 font-mono ${colors[status]}`}>
      {prefix[status]} {msg}
    </p>
  )
}

export function DepositPanel() {
  const { tokens } = useAppStore()
  const { approveToken, deposit, withdraw } = useContractActions()

  const [token,   setToken]   = useState('')
  const [amount,  setAmount]  = useState('100')

  const appSt  = useStatus()
  const depSt  = useStatus()
  const wdSt   = useStatus()

  const tkn = tokens.find(t => t.address === token)

  const handleApprove = async () => {
    if (!tkn) return
    appSt.pending()
    const hash = await approveToken(token as Address, amount, tkn.decimals)
    hash ? appSt.ok(`Approved — tx ${hash.slice(0, 14)}…`) : appSt.error('Failed. See Activity Feed.')
  }

  const handleDeposit = async () => {
    if (!tkn) return
    depSt.pending()
    const res = await deposit(token as Address, amount, tkn.decimals)
    res ? depSt.ok(`Deposited ${amount} ${tkn.symbol}`) : depSt.error('Failed. See Activity Feed.')
  }

  const handleWithdraw = async () => {
    if (!tkn) return
    wdSt.pending()
    const res = await withdraw(token as Address, amount, tkn.decimals)
    res ? wdSt.ok(`Withdrew ${amount} ${tkn.symbol}`) : wdSt.error('Failed. See Activity Feed.')
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Deposit / Withdraw</span>
        <span className="ml-auto text-[11px] text-slate-500">First approve, then deposit</span>
      </div>

      <div className="card-body space-y-4">

        {/* Token + Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Token</label>
            <select value={token} onChange={e => { setToken(e.target.value); appSt.reset(); depSt.reset(); wdSt.reset() }}>
              <option value="">— select token —</option>
              {tokens.map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            className="btn btn-warning flex-1"
            onClick={handleApprove}
            disabled={!tkn || appSt.status === 'pending'}
          >
            1. Approve
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleDeposit}
            disabled={!tkn || depSt.status === 'pending'}
          >
            2. Deposit
          </button>
          <button
            className="btn btn-ghost flex-1"
            onClick={handleWithdraw}
            disabled={!tkn || wdSt.status === 'pending'}
          >
            Withdraw
          </button>
        </div>

        <StatusRow status={appSt.status} msg={appSt.msg} />
        <StatusRow status={depSt.status} msg={depSt.msg} />
        <StatusRow status={wdSt.status}  msg={wdSt.msg} />

      </div>
    </div>
  )
}
