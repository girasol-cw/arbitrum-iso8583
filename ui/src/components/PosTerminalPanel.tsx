/**
 * PosTerminalPanel.tsx
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT / TESTING USE ONLY — NOT FOR PRODUCTION                       ║
 * ║                                                                             ║
 * ║  This panel emulates a physical POS terminal entirely inside the browser.  ║
 * ║  It communicates with the backend using the same raw ISO 8583 binary wire   ║
 * ║  protocol that a real POS device uses over TCP.                             ║
 * ║                                                                             ║
 * ║  In production, the flow is:                                                ║
 * ║    POS hardware ──(raw TCP:5000)──▶ isoTcpServer ──▶ contract on-chain     ║
 * ║                                                                             ║
 * ║  This panel replicates that flow as:                                        ║
 * ║    Browser UI ──(WebSocket /ws/pos)──▶ posSimBridge ──(TCP loopback)──▶    ║
 * ║               ──▶ isoTcpServer ──▶ contract on-chain                        ║
 * ║                                                                             ║
 * ║  The binary codec (posCodec.ts) mirrors backend/src/iso/codec.ts exactly,  ║
 * ║  so every byte sent here is what a real POS would put on the wire.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  encodeFramed,
  decodeFramed,
  buildPosAuthorize,
  buildPosCapture,
  buildPosSinglePurchase,
  buildPosReversal,
  buildPosHeartbeat,
  rcLabel,
  randomStan,
  type RawIsoMessage,
} from '../lib/posCodec'
import { useAppStore } from '../store'

// ── Pre-configured card tokens and merchants (from backend data files) ────────

const CARD_TOKENS = [
  { label: 'CARD_TOKEN_001',   value: 'CARD_TOKEN_001' },
  { label: '4111111111111111', value: '4111111111111111' },
  { label: 'TOK_ALICE_001',    value: 'TOK_ALICE_001' },
  { label: 'TOK_BOB_001',      value: 'TOK_BOB_001' },
]

const MERCHANTS = [
  { label: 'MERCHANT001', value: 'MERCHANT001' },
  { label: 'MERCHANT002', value: 'MERCHANT002' },
  { label: 'MERCHANT003', value: 'MERCHANT003' },
]

const TERMINALS = ['TERM_001', 'TERM_002', 'TERM_003']

type Flow = 'authorize' | 'capture' | 'purchase' | 'reversal' | 'heartbeat'

const FLOW_LABELS: Record<Flow, string> = {
  authorize: '0100  Authorization request',
  capture:   '0200  Capture (after auth)',
  purchase:  '0200  Single-message purchase',
  reversal:  '0400  Reversal / release',
  heartbeat: '0800  Network management (echo)',
}

// ── WebSocket state ───────────────────────────────────────────────────────────

type WsState = 'disconnected' | 'connecting' | 'connected' | 'error'

// ── Log entry ─────────────────────────────────────────────────────────────────

interface LogLine {
  id:        number
  ts:        string
  direction: '▶ sent' | '◀ recv' | '· info' | '✗ error'
  color:     string
  text:      string
  raw?:      RawIsoMessage
}

let lineId = 0
function mkLine(
  direction: LogLine['direction'],
  color: string,
  text: string,
  raw?: RawIsoMessage,
): LogLine {
  return { id: ++lineId, ts: new Date().toLocaleTimeString(), direction, color, text, raw }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PosTerminalPanel() {
  const { addLog } = useAppStore()

  // Form state
  const [flow,        setFlow]        = useState<Flow>('purchase')
  const [cardToken,   setCardToken]   = useState(CARD_TOKENS[0].value)
  const [merchantRef, setMerchantRef] = useState(MERCHANTS[0].value)
  const [terminalId,  setTerminalId]  = useState(TERMINALS[0])
  const [amount,      setAmount]      = useState('42.00')
  const [origStan,    setOrigStan]    = useState('')

  // Connection state
  const [wsState, setWsState] = useState<WsState>('disconnected')
  const wsRef   = useRef<WebSocket | null>(null)
  const recvBuf = useRef<Uint8Array>(new Uint8Array(0))

  // Terminal log
  const [lines, setLines] = useState<LogLine[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)

  // Last approved STAN (for chaining capture/reversal)
  const [lastStan, setLastStan] = useState('')

  const pushLine = useCallback((line: LogLine) => {
    setLines(prev => [...prev, line].slice(-200))
  }, [])

  // Auto-scroll terminal log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines])

  // ── WebSocket connection ───────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setWsState('connecting')
    pushLine(mkLine('· info', 'text-slate-400',
      'Opening WebSocket to /ws/pos (bridge → TCP:5000 → isoTcpServer)…'))

    // The Vite dev-server proxies ws://localhost:5173/ws/pos → ws://localhost:3100/ws/pos
    const wsUrl = `ws://${window.location.host}/ws/pos`
    const ws    = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setWsState('connected')
      pushLine(mkLine('· info', 'text-green-400',
        'Connected. This browser session is now acting as a POS terminal. ' +
        'Every binary frame you send travels the full path: ' +
        'Browser → /ws/pos → posSimBridge → TCP:5000 → isoTcpServer → contract.'))
      addLog('ok', '[POS-SIM] WebSocket bridge connected')
    }

    ws.onclose = (ev) => {
      setWsState('disconnected')
      wsRef.current = null
      recvBuf.current = new Uint8Array(0)
      pushLine(mkLine('· info', 'text-slate-500',
        `Disconnected (code ${ev.code}${ev.reason ? ` – ${ev.reason}` : ''})`))
    }

    ws.onerror = () => {
      setWsState('error')
      pushLine(mkLine('✗ error', 'text-red-400',
        'WebSocket error. Is the backend running? (npm run dev in /backend)'))
      addLog('error', '[POS-SIM] WebSocket connection failed')
    }

    // ── Receive binary ISO 8583 response frames from the server ────────────
    ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      // Accumulate incoming bytes (TCP can fragment across multiple WS messages)
      const chunk  = new Uint8Array(ev.data)
      const merged = new Uint8Array(recvBuf.current.length + chunk.length)
      merged.set(recvBuf.current)
      merged.set(chunk, recvBuf.current.length)
      recvBuf.current = merged

      // Try to decode as many complete frames as possible
      while (true) {
        const result = decodeFramed(recvBuf.current)
        if (!result) break

        const { msg, consumed } = result
        recvBuf.current = recvBuf.current.slice(consumed)

        const rc          = msg.fields['039'] ?? '??'
        const approved    = rc === '00' || rc === '10'
        const stan        = msg.fields['011'] ?? ''
        const rrn         = msg.fields['037'] ?? ''
        const description = rcLabel(rc)

        pushLine(mkLine(
          '◀ recv',
          approved ? 'text-green-400' : 'text-red-400',
          `MTI ${msg.mti}  RC:${rc} ${description}  STAN:${stan}  RRN:${rrn}`,
          msg,
        ))

        addLog(
          approved ? 'ok' : 'error',
          `[POS-SIM] ← ${msg.mti} RC:${rc} ${description}`,
        )
      }
    }
  }, [pushLine, addLog])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  // ── Send a transaction ─────────────────────────────────────────────────────

  const send = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushLine(mkLine('✗ error', 'text-red-400', 'Not connected. Click "Connect POS" first.'))
      return
    }

    const opts = { cardToken, merchantRef, terminalId, amount }

    let msg: RawIsoMessage
    switch (flow) {
      case 'authorize':
        msg = buildPosAuthorize(opts)
        break
      case 'capture':
        msg = buildPosCapture({ ...opts, originalStan: origStan || randomStan() })
        break
      case 'purchase':
        msg = buildPosSinglePurchase(opts)
        break
      case 'reversal':
        msg = buildPosReversal({ ...opts, originalStan: origStan || randomStan() })
        break
      case 'heartbeat':
        msg = buildPosHeartbeat()
        break
    }

    // Save STAN for chaining
    if (msg.fields['011']) setLastStan(msg.fields['011'])

    const frame = encodeFramed(msg)

    pushLine(mkLine(
      '▶ sent',
      'text-indigo-300',
      `MTI ${msg.mti}  STAN:${msg.fields['011'] ?? '–'}  ` +
        (flow !== 'heartbeat' ? `amount:${amount}  card:${cardToken}` : 'heartbeat echo') +
        `  [${frame.length} bytes binary]`,
      msg,
    ))

    ws.send(frame)
  }, [wsRef, flow, cardToken, merchantRef, terminalId, amount, origStan, pushLine])

  const sendHeartbeat = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const msg   = buildPosHeartbeat()
    const frame = encodeFramed(msg)
    pushLine(mkLine('▶ sent', 'text-slate-400', `MTI 0800  heartbeat  [${frame.length} bytes]`, msg))
    ws.send(frame)
  }, [pushLine])

  // ── State colors ───────────────────────────────────────────────────────────

  const wsChip: Record<WsState, string> = {
    disconnected: 'bg-slate-800 text-slate-400 border-slate-700',
    connecting:   'bg-yellow-900/40 text-yellow-300 border-yellow-700 animate-pulse',
    connected:    'bg-green-900/40 text-green-300 border-green-700',
    error:        'bg-red-900/40 text-red-300 border-red-700',
  }

  const wsLabel: Record<WsState, string> = {
    disconnected: '○ Disconnected',
    connecting:   '… Connecting',
    connected:    '● Connected (acting as POS terminal)',
    error:        '✗ Connection error',
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Testing disclaimer ──────────────────────────────────────────── */}
      <div className="rounded border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-[11px] text-amber-300 space-y-1">
        <p className="font-semibold">⚠  DEVELOPMENT / TESTING ONLY</p>
        <p>
          This panel emulates a physical POS terminal in the browser.
          It sends real binary ISO 8583 frames over a WebSocket bridge
          (<code className="font-mono bg-amber-900/30 px-1 rounded">/ws/pos</code>) that
          connects internally to the TCP server on port 5000 — the exact same
          entry-point a real POS device uses.  The full path is:
        </p>
        <p className="font-mono text-amber-200 text-[10px] mt-1">
          Browser → WebSocket /ws/pos → posSimBridge → TCP:5000 → isoTcpServer → contract on-chain
        </p>
        <p>
          In production, replace this panel with a real POS terminal connected
          directly to TCP:5000.  The server-side code does not change.
        </p>
      </div>

      {/* ── Connection bar ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-white">POS Terminal Emulator</span>
          <span className={`ml-3 px-2.5 py-1 rounded border text-[11px] font-mono ${wsChip[wsState]}`}>
            {wsLabel[wsState]}
          </span>
          <div className="ml-auto flex gap-2">
            {wsState !== 'connected' ? (
              <button
                className="btn btn-primary text-[11px]"
                onClick={connect}
                disabled={wsState === 'connecting'}
              >
                Connect POS
              </button>
            ) : (
              <>
                <button
                  className="btn btn-ghost text-[11px]"
                  onClick={sendHeartbeat}
                >
                  ♥ Heartbeat
                </button>
                <button
                  className="btn btn-ghost text-[11px]"
                  onClick={disconnect}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Transaction form ──────────────────────────────────────────── */}
        <div className="card-body space-y-4">

          {/* Flow type */}
          <div>
            <label className="label">ISO 8583 Message Type</label>
            <div className="flex flex-col gap-1.5 mt-1">
              {(Object.keys(FLOW_LABELS) as Flow[]).map(f => (
                <label key={f} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="pos-flow"
                    value={f}
                    checked={flow === f}
                    onChange={() => setFlow(f)}
                    className="accent-indigo-500"
                  />
                  <span className={`text-[11px] font-mono transition-colors ${
                    flow === f ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'
                  }`}>
                    {FLOW_LABELS[f]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {flow !== 'heartbeat' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Card Token (PAN / field 002)</label>
                  <select value={cardToken} onChange={e => setCardToken(e.target.value)}>
                    {CARD_TOKENS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Merchant Ref (field 043)</label>
                  <select value={merchantRef} onChange={e => setMerchantRef(e.target.value)}>
                    {MERCHANTS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Terminal ID (field 042)</label>
                  <select value={terminalId} onChange={e => setTerminalId(e.target.value)}>
                    {TERMINALS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Amount (field 004, major units)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              {(flow === 'capture' || flow === 'reversal') && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="label mb-0">Original STAN (field 090)</label>
                    {lastStan && (
                      <button
                        onClick={() => setOrigStan(lastStan)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5"
                      >
                        Use last STAN ({lastStan})
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="6-digit STAN from the original 0100"
                    value={origStan}
                    onChange={e => setOrigStan(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <button
            className="btn btn-primary w-full"
            onClick={send}
            disabled={wsState !== 'connected'}
          >
            {wsState !== 'connected'
              ? 'Connect POS terminal first'
              : `Send  ${FLOW_LABELS[flow]}`}
          </button>
        </div>
      </div>

      {/* ── Terminal log ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-white">Wire Log</span>
          <span className="ml-2 text-[11px] text-slate-600">binary ISO 8583 frames on the wire</span>
          <button
            className="ml-auto btn btn-ghost text-[11px] py-0.5 px-2"
            onClick={() => setLines([])}
          >
            Clear
          </button>
        </div>

        <div
          ref={logRef}
          className="font-mono text-[11px] max-h-80 overflow-y-auto bg-[#0a0e14] rounded-b p-3 space-y-0.5"
        >
          {lines.length === 0 && (
            <p className="text-slate-600">No traffic yet. Connect and send a message.</p>
          )}

          {lines.map(line => (
            <div key={line.id} className="flex gap-2 items-start">
              <span className="text-slate-600 shrink-0">{line.ts}</span>
              <span className={`shrink-0 w-14 ${
                line.direction === '▶ sent'
                  ? 'text-indigo-400'
                  : line.direction === '◀ recv'
                    ? 'text-green-400'
                    : line.direction === '✗ error'
                      ? 'text-red-400'
                      : 'text-slate-500'
              }`}>
                {line.direction}
              </span>
              <span className={line.color}>{line.text}</span>
            </div>
          ))}
        </div>

        {/* Raw frame inspector */}
        {lines.filter(l => l.raw).slice(-1).map(line => (
          <details key={line.id} className="border-t border-white/5">
            <summary className="px-4 py-2 text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer select-none">
              Last decoded frame fields
            </summary>
            <pre className="px-4 pb-3 text-[10px] text-slate-400 overflow-x-auto">
              {JSON.stringify(line.raw, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  )
}
