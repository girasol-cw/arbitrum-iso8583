/**
 * routes/api.ts
 * Express router: ISO 8583 intake, payment status query, and metrics endpoint.
 */
import { Router, type Request, type Response } from 'express'
import { processIsoMessage } from './intake.js'
import { getPaymentLog, listPaymentLogs } from '../db/paymentLog.js'
import { getMetrics } from '../observability/metrics.js'
import { logger } from '../observability/logger.js'

export const router = Router()

// ── POST /iso/intake ──────────────────────────────────────────────────────────
/**
 * Accepts a raw ISO 8583 JSON message from the upstream payment stack.
 *
 * Body: { mti: string, fields: Record<string, string> }
 *
 * Response: IntakeResponse (see routes/intake.ts)
 */
router.post('/iso/intake', async (req: Request, res: Response) => {
  const traceId = req.headers['x-trace-id'] as string | undefined ?? crypto.randomUUID()
  const log = logger.child({ traceId, path: '/iso/intake' })

  log.info({ body: req.body }, 'ISO intake request received')

  try {
    const result = await processIsoMessage(req.body)
    const httpStatus = result.status === 'approved' || result.status === 'duplicate' ? 200 : 422

    res.status(httpStatus).json({ traceId, ...result })
  } catch (err) {
    log.error({ err }, 'Unhandled error in ISO intake')
    res.status(500).json({
      traceId,
      txId: '',
      action: 'error',
      status: 'declined',
      isoResponseCode: '96',
      message: 'Internal server error',
    })
  }
})

// ── GET /payments/:txId ───────────────────────────────────────────────────────
router.get('/payments/:txId', (req: Request, res: Response) => {
  const { txId } = req.params
  const row = getPaymentLog(txId)
  if (!row) {
    res.status(404).json({ error: 'Payment not found', txId })
    return
  }
  res.json(row)
})

// ── GET /payments ─────────────────────────────────────────────────────────────
router.get('/payments', (req: Request, res: Response) => {
  const limit  = Math.min(Number(req.query['limit']  ?? 50), 200)
  const offset = Number(req.query['offset'] ?? 0)
  res.json(listPaymentLogs(limit, offset))
})

// ── GET /metrics ──────────────────────────────────────────────────────────────
router.get('/metrics', (_req: Request, res: Response) => {
  res.json(getMetrics())
})

// ── GET /health ───────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})
