/**
 * index.ts
 * Application entry point.
 * Initialises the database, starts the Express server, and begins the retry
 * worker loop.
 */
import express from 'express'
import { config } from './config.js'
import { getDb, runMigrations, closeDb } from './db/client.js'
import { router } from './routes/api.js'
import { logger } from './observability/logger.js'
import { syncNonce, relayerAddress } from './relayer/wallet.js'
import { createIsoTcpServer } from './tcp/isoTcpServer.js'
import { attachPosSimBridge } from './tcp/posSimBridge.js'

async function bootstrap() {
  // ── 1. Database ────────────────────────────────────────────────────────────
  await runMigrations()

  // ── 2. Relayer nonce ───────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'test') {
    await syncNonce()
    logger.info({ address: relayerAddress() }, 'Relayer wallet ready')
  }

  // ── 3. ISO 8583 TCP server ────────────────────────────────────────────
  const tcpServer = config.NODE_ENV !== 'test' ? createIsoTcpServer() : null

  // ── 4. HTTP server ──────────────────────────────────────────────────
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // Request logger middleware
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, 'Incoming request')
    next()
  })

  app.use('/', router)

  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, contract: config.CONTRACT_ADDRESS },
      'ISO 8583 middleware started',
    )
  })

  // ── 5. POS simulator WebSocket bridge (DEVELOPMENT / TESTING ONLY) ────────
  //
  //  In production, real POS terminals connect directly via raw TCP (TCP_PORT).
  //  Browsers cannot open raw TCP sockets, so in non-production environments we
  //  attach a WebSocket bridge at ws://…/ws/pos that forwards binary ISO 8583
  //  frames to and from the isoTcpServer over a loopback TCP connection.
  //
  //  Flow:   Browser → WebSocket /ws/pos → posSimBridge → TCP:TCP_PORT → isoTcpServer
  //
  //  The bridge is intentionally disabled in production (NODE_ENV=production).
  if (config.NODE_ENV !== 'production') {
    attachPosSimBridge(server)
  }

  // ── 6. Graceful shutdown ───────────────────────────────────────────────
  const shutdown = () => {
    server.close()
    tcpServer?.close()
    closeDb().finally(() => process.exit(0))
  }

  process.on('SIGTERM', () => { logger.info('SIGTERM received – shutting down gracefully'); shutdown() })
  process.on('SIGINT',  () => { logger.info('SIGINT received – shutting down');             shutdown() })
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
