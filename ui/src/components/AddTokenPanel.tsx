import { useState } from 'react'
import { isAddress } from 'viem'
import type { Address } from 'viem'
import { useAppStore } from '../store'
import type { TokenInfo } from '../store'
import { useContractActions } from '../hooks/useContractActions'

type Phase = 'idle' | 'resolving' | 'resolved' | 'configuring' | 'done' | 'error'

export function AddTokenPanel() {
  const { tokens, addToken } = useAppStore()
  const { resolveToken, configureToken } = useContractActions()

  const [addr,       setAddr]       = useState('')
  const [preview,    setPreview]    = useState<TokenInfo | null>(null)
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [msg,        setMsg]        = useState('')
  const [cfgAllowed, setCfgAllowed] = useState(true)

  const alreadyInUI = preview ? tokens.some(t => t.address.toLowerCase() === preview.address.toLowerCase()) : false

  const handleResolve = async () => {
    const trimmed = addr.trim()
    if (!isAddress(trimmed)) { setPhase('error'); setMsg('Invalid address'); return }
    setPhase('resolving'); setMsg('Fetching token metadata…'); setPreview(null)
    const info = await resolveToken(trimmed as Address)
    if (!info) { setPhase('error'); setMsg('Could not read token metadata — not an ERC-20?'); return }
    setPreview(info)
    setPhase('resolved')
    setMsg('')
  }

  const handleAddToUI = () => {
    if (!preview) return
    addToken(preview)
    setMsg(`${preview.symbol} added to the UI token list`)
    setPhase('done')
  }

  const handleConfigure = async () => {
    if (!preview) return
    setPhase('configuring'); setMsg(`Calling configureToken(${preview.symbol}, ${cfgAllowed})…`)
    const res = await configureToken(preview.address, cfgAllowed)
    if (res) {
      addToken(preview)
      setPhase('done')
      setMsg(`${preview.symbol} configured (allowed=${cfgAllowed}) and added to UI`)
    } else {
      setPhase('error')
      setMsg('configureToken failed — check roles or console')
    }
  }

  const reset = () => {
    setAddr(''); setPreview(null); setPhase('idle'); setMsg('')
  }

  const phaseColor: Record<Phase, string> = {
    idle:       'text-slate-500',
    resolving:  'text-yellow-400',
    resolved:   'text-blue-400',
    configuring:'text-yellow-400',
    done:       'text-green-400',
    error:      'text-red-400',
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Custom ERC-20 Token</span>
        <span className="ml-auto text-[11px] text-slate-500">Add any token to the UI / contract</span>
      </div>

      <div className="card-body space-y-4">
        {/* Address input */}
        <div>
          <label className="label">Token Address</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder="0x…"
              value={addr}
              onChange={e => { setAddr(e.target.value); setPhase('idle'); setMsg(''); setPreview(null) }}
            />
            <button
              className="btn btn-primary"
              onClick={handleResolve}
              disabled={phase === 'resolving'}
            >
              {phase === 'resolving' ? '…' : 'Resolve'}
            </button>
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-4">
            <div>
              <p className="text-white font-bold text-sm">{preview.symbol}</p>
              <p className="text-slate-500 text-[11px] font-mono">{preview.address}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11px]">
              <span className="text-slate-400">{preview.decimals} decimals</span>
              {alreadyInUI && (
                <span className="px-2 py-0.5 rounded-full bg-green-950 text-green-400 border border-green-800">
                  In UI
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {preview && (
          <div className="space-y-3">
            {/* Add to UI only */}
            {!alreadyInUI && (
              <button
                className="btn btn-success w-full"
                onClick={handleAddToUI}
                disabled={phase === 'configuring' || phase === 'done'}
              >
                Add to UI (no on-chain write)
              </button>
            )}

            {/* Configure in contract */}
            <div className="flex gap-2 items-center">
              <button
                className="btn btn-primary flex-1"
                onClick={handleConfigure}
                disabled={phase === 'configuring'}
              >
                {phase === 'configuring' ? 'Sending…' : `Configure in Contract`}
              </button>
              <select
                className="input w-28"
                value={cfgAllowed ? 'true' : 'false'}
                onChange={e => setCfgAllowed(e.target.value === 'true')}
              >
                <option value="true">Allow</option>
                <option value="false">Disallow</option>
              </select>
            </div>
          </div>
        )}

        {/* Status message */}
        {msg && (
          <p className={`text-xs font-mono ${phaseColor[phase]}`}>{msg}</p>
        )}

        {/* Existing tokens summary */}
        {tokens.length > 0 && (
          <div>
            <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">Tokens in UI</p>
            <div className="flex flex-wrap gap-1.5">
              {tokens.map(t => (
                <span
                  key={t.address}
                  className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[11px] font-mono"
                >
                  {t.symbol}
                </span>
              ))}
            </div>
          </div>
        )}

        {(phase === 'done' || phase === 'error') && (
          <button className="btn btn-ghost text-xs w-full" onClick={reset}>Reset</button>
        )}
      </div>
    </div>
  )
}
