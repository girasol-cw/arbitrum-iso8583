import { useState } from 'react'
import type { Address } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'

type Status = 'idle' | 'pending' | 'ok' | 'error'

function StatusRow({ status, msg }: { status: Status; msg: string }) {
  if (!msg) return null
  const colors: Record<Status, string> = {
    idle: 'text-slate-500', pending: 'text-yellow-400', ok: 'text-green-400', error: 'text-red-400',
  }
  return <p className={`text-xs mt-2 font-mono ${colors[status]}`}>{msg}</p>
}

const ROLES = ['DEFAULT_ADMIN_ROLE', 'RELAYER_ROLE', 'PAUSER_ROLE', 'TOKEN_ADMIN_ROLE']

export function AdminPanel() {
  const { tokens, isPaused } = useAppStore()
  const { configureToken, grantRole, revokeRole, pause, unpause } = useContractActions()

  // Token config
  const [cfgToken, setCfgToken] = useState('')
  const [cfgAllow, setCfgAllow] = useState('true')
  const [cfgSt,    setCfgSt]   = useState<Status>('idle')
  const [cfgMsg,   setCfgMsg]  = useState('')

  // Roles
  const [role,    setRole]    = useState(ROLES[0])
  const [account, setAccount] = useState('')
  const [roleSt,  setRoleSt]  = useState<Status>('idle')
  const [roleMsg, setRoleMsg] = useState('')

  // Pause
  const [pauseSt,  setPauseSt]  = useState<Status>('idle')
  const [pauseMsg, setPauseMsg] = useState('')

  const handleConfigureToken = async () => {
    if (!cfgToken) { setCfgSt('error'); setCfgMsg('Select a token'); return }
    setCfgSt('pending'); setCfgMsg('Sending…')
    const res = await configureToken(cfgToken as Address, cfgAllow === 'true')
    res ? (setCfgSt('ok'), setCfgMsg('Token configured')) : (setCfgSt('error'), setCfgMsg('Failed'))
  }

  const handleGrant = async () => {
    if (!account.trim()) { setRoleSt('error'); setRoleMsg('Enter an address'); return }
    setRoleSt('pending'); setRoleMsg('Sending…')
    const res = await grantRole(role, account.trim() as Address)
    res ? (setRoleSt('ok'), setRoleMsg(`Role granted`)) : (setRoleSt('error'), setRoleMsg('Failed'))
  }

  const handleRevoke = async () => {
    if (!account.trim()) { setRoleSt('error'); setRoleMsg('Enter an address'); return }
    setRoleSt('pending'); setRoleMsg('Sending…')
    const res = await revokeRole(role, account.trim() as Address)
    res ? (setRoleSt('ok'), setRoleMsg('Role revoked')) : (setRoleSt('error'), setRoleMsg('Failed'))
  }

  const handlePause = async () => {
    setPauseSt('pending'); setPauseMsg('Sending…')
    const res = await pause()
    res ? (setPauseSt('ok'), setPauseMsg('Contract paused')) : (setPauseSt('error'), setPauseMsg('Failed'))
  }

  const handleUnpause = async () => {
    setPauseSt('pending'); setPauseMsg('Sending…')
    const res = await unpause()
    res ? (setPauseSt('ok'), setPauseMsg('Contract unpaused')) : (setPauseSt('error'), setPauseMsg('Failed'))
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Administration</span>
        <span className="ml-auto text-[11px] text-slate-500">TOKEN_ADMIN_ROLE / PAUSER_ROLE</span>
      </div>

      <div className="card-body space-y-5">

        {/* ── Contract Status ──────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Contract Status</p>
          <div className="flex items-center gap-3">
            <span className={`font-bold text-sm ${isPaused ? 'text-red-400' : 'text-green-400'}`}>
              {isPaused ? '⛔ Paused' : '● Live'}
            </span>
            <button className="btn btn-warning" onClick={handlePause}   disabled={pauseSt === 'pending'}>Pause</button>
            <button className="btn btn-success" onClick={handleUnpause} disabled={pauseSt === 'pending'}>Unpause</button>
          </div>
          <StatusRow status={pauseSt} msg={pauseMsg} />
        </div>

        <hr className="border-white/5" />

        {/* ── Configure Token ──────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Configure Token</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Token</label>
              <select value={cfgToken} onChange={e => setCfgToken(e.target.value)}>
                <option value="">— select —</option>
                {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={cfgAllow} onChange={e => setCfgAllow(e.target.value)}>
                <option value="true">Allowed</option>
                <option value="false">Blocked</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary mt-3" onClick={handleConfigureToken} disabled={cfgSt === 'pending'}>
            Update Token
          </button>
          <StatusRow status={cfgSt} msg={cfgMsg} />
        </div>

        <hr className="border-white/5" />

        {/* ── Roles ────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Access Roles</p>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Address</label>
              <input
                value={account}
                onChange={e => setAccount(e.target.value)}
                placeholder="0x…"
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary"   onClick={handleGrant}  disabled={roleSt === 'pending'}>Grant</button>
            <button className="btn btn-danger"    onClick={handleRevoke} disabled={roleSt === 'pending'}>Revoke</button>
          </div>
          <StatusRow status={roleSt} msg={roleMsg} />
        </div>

      </div>
    </div>
  )
}
