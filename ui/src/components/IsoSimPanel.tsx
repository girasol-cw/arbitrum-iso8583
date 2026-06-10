/**
 * IsoSimPanel.tsx
 * Simulates full ISO 8583 payment flows through the backend middleware,
 * which in turn submits the corresponding contract calls on-chain.
 *
 * Supported flows:
 *  1. Authorize only (MTI 0100)
 *  2. Authorize → Capture (0100 → 0200)
 *  3. Single-message purchase (MTI 0200, proc 28xxxx)
 *  4. Reversal / Release (MTI 0400)
 *  5. Heartbeat echo (MTI 0800)
 */
import { useState } from 'react'
import {
  backendApi,
  buildAuthorizeMsg,
  buildCaptureMsg,
  buildReversalMsg,
  buildHeartbeatMsg,
  randomStan,
  type IntakeResponse,
} from '../lib/backendApi'
import { useAppStore } from '../store'

// ── Card tokens and merchants from the backend data files ─────────────────────
const CARD_TOKENS = [
  { label: 'CARD_TOKEN_001',    value: 'CARD_TOKEN_001' },
  { label: '4111111111111111',  value: '4111111111111111' },
  { label: 'TOK_ALICE_001',     value: 'TOK_ALICE_001' },
  { label: 'TOK_BOB_001',       value: 'TOK_BOB_001' },
] as const

const MERCHANTS = [
  { label: 'MERCHANT001', value: 'MERCHANT001' },
  { label: 'MERCHANT002', value: 'MERCHANT002' },
  { label: 'MERCHANT003', value: 'MERCHANT003' },
] as const

const TERMINALS = ['TERM_001', 'TERM_002', 'TERM_003']

const CURRENCIES = [
  { label: 'USD (840)', value: '840' },
  { label: 'EUR (978)', value: '978' },
]

type Flow = 'authorize' | 'capture' | 'purchase' | 'reversal' | 'heartbeat'

const FLOW_LABELS: Record<Flow, string> = {
  authorize: '0100 — Authorize',
  capture:   '0200 — Capture (after auth)',
  purchase:  '0200 — Single-message Purchase',
  reversal:  '0400 — Reversal / Release',
  heartbeat: '0800 — Heartbeat',
}

type ReqStatus = 'idle' | 'pending' | 'ok' | 'error'

interface RequestEntry {
  id:       number
  ts:       string
  flow:     Flow
  request:  object
  response: IntakeResponse | null
  error:    string | null
  ms:       number
}

let entryId = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: IntakeResponse['status'] | undefined): string {
  switch (s) {
    case 'approved':    return 'text-green-400'
    case 'duplicate':   return 'text-sky-400'
    case 'pending':     return 'text-yellow-400'
    case 'declined':
    case 'unsupported': return 'text-red-400'
    default:            return 'text-slate-400'
  }
}

function actionBadge(a: string): string {
  const map: Record<string, string> = {
    authorize:            'bg-indigo-900/50 text-indigo-300 border-indigo-700',
    authorize_and_capture:'bg-purple-900/50 text-purple-300 border-purple-700',
    capture:              'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    release:              'bg-amber-900/50  text-amber-300  border-amber-700',
    heartbeat:            'bg-slate-800     text-slate-400  border-slate-700',
    parse_error:          'bg-red-900/50    text-red-300    border-red-700',
    error:                'bg-red-900/50    text-red-300    border-red-700',
    unsupported:          'bg-slate-800     text-slate-500  border-slate-700',
  }
  return map[a] ?? 'bg-slate-800 text-slate-400 border-slate-700'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IsoSimPanel() {
  const { addLog } = useAppStore()

  // Form state
  const [flow,        setFlow]        = useState<Flow>('authorize')
  const [cardToken,   setCardToken]   = useState(CARD_TOKENS[0].value)
  const [merchantRef, setMerchantRef] = useState(MERCHANTS[0].value)
  const [terminalId,  setTerminalId]  = useState(TERMINALS[0])
  const [amount,      setAmount]      = useState('25.00')
  const [currency,    setCurrency]    = useState('840')
  const [origStan,    setOrigStan]    = useState('')

  // Submission state
  const [reqStatus, setReqStatus] = useState<ReqStatus>('idle')
  const [history,   setHistory]   = useState<RequestEntry[]>([])

  // Last approved STAN (for reversal chaining)
  const [lastStan, setLastStan] = useState<string>('')

  const send = async () => {
    setReqStatus('pending')
    const t0 = performance.now()

    let msg: ReturnType<typeof buildAuthorizeMsg>
    const opts = { cardToken, merchantRef, terminalId, amount, currency }

    switch (flow) {
      case 'authorize':
        msg = buildAuthorizeMsg(opts)
        break
      case 'capture':
        msg = buildCaptureMsg({ ...opts, originalStan: origStan || undefined })
        break
      case 'purchase':
        msg = {
          ...buildCaptureMsg(opts),
          fields: {
            ...buildCaptureMsg(opts).fields,
            '003': '280000', // single-message proc code
          },
        }
        break
      case 'reversal':
        msg = buildReversalMsg({
          ...opts,
          originalStan: origStan || randomStan(),
        })
        break
      case 'heartbeat':
        msg = buildHeartbeatMsg()
        break
    }

    let resp: IntakeResponse | null = null
    let errMsg: string | null = null

    try {
      resp = await backendApi.intake(msg)
      const ms = Math.round(performance.now() - t0)

      if (resp.status === 'approved' || resp.status === 'duplicate') {
        setReqStatus('ok')
        // Save STAN so the user can chain a reversal
        if (msg.fields['011']) setLastStan(msg.fields['011'])
        addLog('ok', `[ISO] ${flow} → ${resp.status} | txId:${resp.txId.slice(0, 16)}… | rc:${resp.isoResponseCode}`)
      } else {
        setReqStatus('error')
        addLog('error', `[ISO] ${flow} → ${resp.status} | rc:${resp.isoResponseCode} | ${resp.message ?? ''}`)
      }

      setHistory(h => [
        {
          id:       ++entryId,
          ts:       new Date().toLocaleTimeString(),
          flow,
          request:  msg,
          response: resp,
          error:    null,
          ms,
        },
        ...h,
      ].slice(0, 50))
    } catch (err) {
      errMsg = (err as Error).message
      setReqStatus('error')
      addLog('error', `[ISO] ${flow} → network error: ${errMsg}`)
      setHistory(h => [
        {
          id:       ++entryId,
          ts:       new Date().toLocaleTimeString(),
          flow,
          request:  msg,
          response: null,
          error:    errMsg,
          ms:       Math.round(performance.now() - t0),
        },
        ...h,
      ].slice(0, 50))
    }
  }

  const fillFromLast = () => {
    if (lastStan) setOrigStan(lastStan)
  }

  const heartbeat = async () => {
    setReqStatus('pending')
    const t0 = performance.now()
    try {
      const resp = await backendApi.intake(buildHeartbeatMsg())
      const ms = Math.round(performance.now() - t0)
      setReqStatus('ok')
      addLog('ok', `[ISO] heartbeat → ${resp.status} (${ms}ms)`)
      setHistory(h => [
        { id: ++entryId, ts: new Date().toLocaleTimeString(), flow: 'heartbeat', request: buildHeartbeatMsg(), response: resp, error: null, ms },
        ...h,
      ].slice(0, 50))
    } catch (err) {
      setReqStatus('error')
      addLog('error', `[ISO] heartbeat failed: ${(err as Error).message}`)
    }
  }

  const statusColors: Record<ReqStatus, string> = {
    idle:    '',
    pending: 'text-yellow-400 animate-pulse',
    ok:      'text-green-400',
    error:   'text-red-400',
  }

  return (
    <div className="space-y-4">

      {/* ── Form card ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-white">ISO 8583 Simulator</span>
          <span className="ml-auto text-[11px] text-slate-500">
            → backend middleware → contract on-chain
          </span>
        </div>

        <div className="card-body space-y-4">

          {/* Flow selector */}
          <div>
            <label className="label">Message Flow</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(Object.keys(FLOW_LABELS) as Flow[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFlow(f)}
                  className={`px-3 py-1.5 rounded border text-[11px] font-mono transition-all ${
                    flow === f
                      ? 'bg-indigo-900/60 border-indigo-600 text-indigo-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {FLOW_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {flow !== 'heartbeat' && (
            <>
              {/* Card token + Merchant */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Card Token</label>
                  <select value={cardToken} onChange={e => setCardToken(e.target.value)}>
                    {CARD_TOKENS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Merchant Ref</label>
                  <select value={merchantRef} onChange={e => setMerchantRef(e.target.value)}>
                    {MERCHANTS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Terminal + Currency + Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Terminal ID</label>
                  <select value={terminalId} onChange={e => setTerminalId(e.target.value)}>
                    {TERMINALS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Original STAN for capture/reversal */}
              {(flow === 'capture' || flow === 'reversal') && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="label mb-0">Original STAN (field 090)</label>
                    {lastStan && (
                      <button
                        onClick={fillFromLast}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5"
                      >
                        Fill from last ({lastStan})
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="6-digit STAN from the original authorize"
                    value={origStan}
                    onChange={e => setOrigStan(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              className="btn btn-primary flex-1"
              onClick={send}
              disabled={reqStatus === 'pending'}
            >
              {reqStatus === 'pending' ? 'Sending…' : `Send ${FLOW_LABELS[flow]}`}
            </button>
            <button
              className="btn btn-ghost"
              onClick={heartbeat}
              disabled={reqStatus === 'pending'}
              title="Quick heartbeat test"
            >
              ♥ Ping
            </button>
          </div>

          {reqStatus !== 'idle' && (
            <p className={`text-[11px] font-mono ${statusColors[reqStatus]}`}>
              {reqStatus === 'pending' && 'Waiting for backend → contract…'}
              {reqStatus === 'ok'      && 'Last request: approved ✓'}
              {reqStatus === 'error'   && 'Last request: failed ✗  (see history below)'}
            </p>
          )}
        </div>
      </div>

      {/* ── Request history ────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-white">Request History</span>
            <span className="ml-auto text-[11px] text-slate-500">{history.length} entries</span>
            <button
              className="btn btn-ghost text-[11px] py-0.5 px-2 ml-2"
              onClick={() => setHistory([])}
            >
              Clear
            </button>
          </div>

          <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
            {history.map(entry => (
              <div key={entry.id} className="px-4 py-3 space-y-1.5 hover:bg-white/[0.02]">
                {/* Header row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-slate-600 text-[11px] font-mono shrink-0">{entry.ts}</span>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                    actionBadge(entry.response?.action ?? 'error')
                  }`}>
                    {entry.response?.action ?? 'error'}
                  </span>
                  {entry.response && (
                    <span className={`text-[11px] font-semibold ${statusColor(entry.response.status)}`}>
                      {entry.response.status}
                    </span>
                  )}
                  {entry.response?.isoResponseCode && (
                    <span className="text-slate-500 text-[11px] font-mono">
                      RC:{entry.response.isoResponseCode}
                    </span>
                  )}
                  <span className="text-slate-600 text-[11px] ml-auto shrink-0">{entry.ms}ms</span>
                </div>

                {/* txId + txHash */}
                {entry.response?.txId && (
                  <div className="flex gap-2 flex-wrap text-[11px] font-mono">
                    <span className="text-slate-500">txId:</span>
                    <span className="text-slate-300 break-all">{entry.response.txId}</span>
                  </div>
                )}
                {entry.response?.txHash && (
                  <div className="flex gap-2 flex-wrap text-[11px] font-mono">
                    <span className="text-slate-500">hash:</span>
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${entry.response.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 hover:underline break-all"
                    >
                      {entry.response.txHash.slice(0, 16)}…{entry.response.txHash.slice(-8)}↗
                    </a>
                    {entry.response.blockNumber && (
                      <span className="text-slate-500">block {entry.response.blockNumber}</span>
                    )}
                  </div>
                )}

                {/* Error */}
                {(entry.error || entry.response?.message) && (
                  <p className="text-red-400 text-[11px] font-mono break-all">
                    {entry.error ?? entry.response?.message}
                  </p>
                )}

                {/* Raw request toggle */}
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-400 select-none">
                    Show raw ISO message
                  </summary>
                  <pre className="mt-1 p-2 bg-slate-900 rounded text-slate-400 overflow-x-auto text-[10px]">
                    {JSON.stringify(entry.request, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
