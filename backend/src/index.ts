/**
 * index.ts
 * Application entry point.
 * Initialises the database, starts the Express server, and begins the retry
 * worker loop.
 */
import express from 'express'
import { config } from './config.js'
import { getDb } from './db/client.js'
import { router } from './routes/api.js'
import { logger } from './observability/logger.js'
import { syncNonce, relayerAddress } from './relayer/wallet.js'

async function bootstrap() {
  // ── 1. Database ────────────────────────────────────────────────────────────
  getDb() // triggers migrations

  // ── 2. Relayer nonce ───────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'test') {
    await syncNonce()
    logger.info({ address: relayerAddress() }, 'Relayer wallet ready')
  }

  // ── 3. HTTP server ─────────────────────────────────────────────────────────
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

  // ── 4. Graceful shutdown ───────────────────────────────────────────────────
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received – shutting down gracefully')
    server.close(() => process.exit(0))
  })

  process.on('SIGINT', () => {
    logger.info('SIGINT received – shutting down')
    server.close(() => process.exit(0))
  })
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
