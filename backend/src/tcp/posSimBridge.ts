/**
 * tcp/posSimBridge.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT / TESTING USE ONLY — NOT FOR PRODUCTION                       ║
 * ║                                                                             ║
 * ║  In production, real POS terminals communicate via a raw TCP socket on      ║
 * ║  TCP_PORT (default 5000).  Browsers cannot open raw TCP sockets, so this    ║
 * ║  module provides a WebSocket ↔ TCP bridge that lets the UI emulate a POS   ║
 * ║  terminal during development.                                               ║
 * ║                                                                             ║
 * ║  Real production flow:                                                      ║
 * ║    POS hardware ──(raw TCP)──▶ isoTcpServer ──▶ contract on-chain          ║
 * ║                                                                             ║
 * ║  Simulated dev/test flow:                                                   ║
 * ║    Browser UI ──(WebSocket)──▶ this bridge ──(TCP loopback)──▶ isoTcpServer║
 * ║                               /ws/pos                     :TCP_PORT        ║
 * ║                                                                             ║
 * ║  The bridge is only mounted when NODE_ENV !== 'production'.                 ║
 * ║  It is transparent: every binary WebSocket message received from the        ║
 * ║  browser is written verbatim to the TCP socket, and every byte the TCP      ║
 * ║  server sends back is forwarded verbatim to the WebSocket client.           ║
 * ║  The browser must therefore implement the same binary framing as a real     ║
 * ║  POS device (see ui/src/lib/posCodec.ts).                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import net from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { config } from '../config.js'
import { logger } from '../observability/logger.js'

const bridgeLog = logger.child({ module: 'posSimBridge' })

// ── One browser session = one loopback TCP connection ────────────────────────

function handleWsClient(ws: WebSocket, req: IncomingMessage): void {
  const clientIp = req.socket.remoteAddress ?? 'unknown'
  const sessionLog = bridgeLog.child({ clientIp })

  sessionLog.info(
    { tcpPort: config.TCP_PORT },
    '[POS-SIM] Browser POS simulator connected – opening loopback TCP to isoTcpServer',
  )

  // Open a loopback TCP connection to the running isoTcpServer
  const tcp = net.createConnection({ host: '127.0.0.1', port: config.TCP_PORT })

  // ── TCP → WebSocket (server responses → browser) ─────────────────────────
  tcp.on('data', (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(chunk, { binary: true }, (err) => {
        if (err) sessionLog.warn({ err }, '[POS-SIM] Error forwarding TCP response to WebSocket')
      })
    }
  })

  tcp.on('connect', () => {
    sessionLog.info('[POS-SIM] Loopback TCP connection established → ready to receive ISO 8583 frames')
  })

  tcp.on('error', (err) => {
    sessionLog.warn(
      { err: err.message },
      '[POS-SIM] Loopback TCP error – is isoTcpServer running on port ' + config.TCP_PORT + '?',
    )
    if (ws.readyState === ws.OPEN) ws.close(1011, 'TCP connection error')
  })

  tcp.on('close', () => {
    sessionLog.info('[POS-SIM] Loopback TCP connection closed')
    if (ws.readyState === ws.OPEN) ws.close(1000, 'TCP connection closed')
  })

  // ── WebSocket → TCP (browser sends ISO 8583 frame → server) ─────────────
  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (!isBinary) {
      sessionLog.warn('[POS-SIM] Received non-binary WebSocket message – ignoring (only binary ISO 8583 frames are accepted)')
      return
    }

    const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)

    sessionLog.debug(
      { bytes: frame.length },
      '[POS-SIM] Browser → ISO 8583 frame → forwarding to isoTcpServer',
    )

    if (!tcp.destroyed) {
      tcp.write(frame, (err) => {
        if (err) sessionLog.warn({ err }, '[POS-SIM] Error writing frame to TCP socket')
      })
    }
  })

  ws.on('close', (code, reason) => {
    sessionLog.info(
      { code, reason: reason.toString() },
      '[POS-SIM] Browser WebSocket disconnected – closing loopback TCP',
    )
    tcp.destroy()
  })

  ws.on('error', (err) => {
    sessionLog.warn({ err }, '[POS-SIM] WebSocket error')
    tcp.destroy()
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach a WebSocket server to the given HTTP server that acts as a bridge
 * between the browser POS simulator and the ISO 8583 TCP server.
 *
 * ⚠️  Only call this in non-production environments.
 *
 * @param httpServer  The same Express HTTP server instance used by the app.
 *
 * Usage in index.ts:
 *   if (config.NODE_ENV !== 'production') {
 *     attachPosSimBridge(server)
 *   }
 */
export function attachPosSimBridge(httpServer: HttpServer): WebSocketServer {
  // Only accept connections on the /ws/pos path so the same HTTP server can
  // serve other WebSocket routes in the future without conflict.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/pos' })

  wss.on('connection', handleWsClient)

  wss.on('error', (err) => {
    bridgeLog.error({ err }, '[POS-SIM] WebSocketServer error')
  })

  bridgeLog.warn(
    { path: '/ws/pos', tcpPort: config.TCP_PORT },
    '╔════════════════════════════════════════════════════════════╗\n' +
    '║  POS Simulator WebSocket bridge mounted at ws://…/ws/pos  ║\n' +
    '║  THIS IS FOR DEVELOPMENT / TESTING ONLY.                  ║\n' +
    '║  Disable by setting NODE_ENV=production.                  ║\n' +
    '╚════════════════════════════════════════════════════════════╝',
  )

  return wss
}
