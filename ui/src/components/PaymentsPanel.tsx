import { useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { randomBytes32 } from '../lib/utils'
import { TEST_ACCOUNTS } from '../lib/accounts'

type Status = 'idle' | 'pending' | 'ok' | 'error'

function StatusRow({ status, msg }: { status: Status; msg: string }) {
  if (!msg) return null
  const colors: Record<Status, string> = {
    idle: 'text-slate-500', pending: 'text-yellow-400', ok: 'text-green-400', error: 'text-red-400',
  }
  return <p className={`text-xs mt-2 font-mono ${colors[status]}`}>{msg}</p>
}

export function PaymentsPanel() {
  const { tokens } = useAppStore()
  const { authorize, capture, release, expire, batchExpire } = useContractActions()

  // Authorize
  const [txId,     setTxId]    = useState('')
  const [user,     setUser]    = useState<Address>(TEST_ACCOUNTS[0].address)
  const [merchant, setMerchant]= useState<Address>(TEST_ACCOUNTS[0].address)
  const [authToken,setAuthToken]= useState('')
  const [amount,   setAmount]  = useState('10')
  const [expiresIn,setExpiresIn]= useState('3600')
  const [authStatus, setAuthStatus] = useState<Status>('idle')
  const [authMsg,    setAuthMsg]    = useState('')

  // Capture / Release / Expire
  const [actionTxId, setActionTxId] = useState('')
  const [actionStatus, setActionStatus] = useState<Status>('idle')
  const [actionMsg,    setActionMsg]    = useState('')

  const tkn = tokens.find(t => t.address === authToken)

  const handleAuthorize = async () => {
    if (!tkn || !user || !merchant) {
      setAuthStatus('error'); setAuthMsg('Fill all fields'); return
    }
    const id = txId.trim() || randomBytes32()
    setTxId(id)
    setAuthStatus('pending'); setAuthMsg('Sending…')
    const res = await authorize(
      id as Hex, user as Address, merchant as Address,
      authToken as Address, amount, tkn.decimals, Number(expiresIn),
    )
    if (res) {
      setAuthStatus('ok')
      setAuthMsg(`Authorized — Payment ID: ${id.slice(0, 16)}…`)
      setActionTxId(id)
    } else {
      setAuthStatus('error'); setAuthMsg('Failed. See Activity Feed.')
    }
  }

  const doAction = async (fn: 'capture' | 'release' | 'expire') => {
    if (!actionTxId.trim()) {
      setActionStatus('error'); setActionMsg('Enter a Payment ID'); return
    }
    setActionStatus('pending'); setActionMsg(`${fn}…`)
    const fns = { capture, release, expire }
    const res = await fns[fn](actionTxId.trim() as Hex)
    if (res) {
      setActionStatus('ok'); setActionMsg(`${fn} confirmed`)
    } else {
      setActionStatus('error'); setActionMsg('Failed. See Activity Feed.')
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Payments</span>
        <span className="ml-auto text-[11px] text-slate-500">Requires RELAYER_ROLE</span>
      </div>

      <div className="card-body space-y-5">

        {/* ── Step 1: Authorize ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
            Step 1 — Authorize payment
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Token</label>
              <select value={authToken} onChange={e => setAuthToken(e.target.value)}>
                <option value="">— select —</option>
                {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">User (payer)</label>
              <input
                value={user}
                onChange={e => setUser(e.target.value as Address)}
                className="font-mono"
                placeholder="0x…"
              />
            </div>
            <div>
              <label className="label">Merchant (receiver)</label>
              <input
                value={merchant}
                onChange={e => setMerchant(e.target.value as Address)}
                className="font-mono"
                placeholder="0x…"
              />
            </div>
            <div>
              <label className="label">Expires in (seconds)</label>
              <input type="number" value={expiresIn} onChange={e => setExpiresIn(e.target.value)} />
            </div>
            <div>
              <label className="label">
                Payment ID
                <button
                  className="ml-2 text-indigo-400 hover:underline text-[10px]"
                  onClick={() => setTxId(randomBytes32())}
                >
                  Generate
                </button>
              </label>
              <input value={txId} onChange={e => setTxId(e.target.value)} placeholder="0x… or leave blank" />
            </div>
          </div>

          <button
            className="btn btn-primary mt-3 w-full"
            onClick={handleAuthorize}
            disabled={authStatus === 'pending'}
          >
            Authorize Payment
          </button>
          <StatusRow status={authStatus} msg={authMsg} />
        </div>

        <hr className="border-white/5" />

        {/* ── Step 2: Capture / Release / Expire ───────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
            Step 2 — Settle or cancel
          </p>

          <div>
            <label className="label">Payment ID</label>
            <input
              value={actionTxId}
              onChange={e => setActionTxId(e.target.value)}
              placeholder="0x…"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              className="btn btn-success"
              onClick={() => doAction('capture')}
              disabled={actionStatus === 'pending'}
            >
              ✓ Capture
            </button>
            <button
              className="btn btn-warning"
              onClick={() => doAction('release')}
              disabled={actionStatus === 'pending'}
            >
              ↩ Release
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => doAction('expire')}
              disabled={actionStatus === 'pending'}
            >
              ⌛ Expire
            </button>
          </div>
          <StatusRow status={actionStatus} msg={actionMsg} />
        </div>

      </div>
    </div>
  )
}
