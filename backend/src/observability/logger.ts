/**
 * observability/logger.ts
 * Pino structured logger with request-tracing support.
 */
import pino from 'pino'
import { config } from '../config.js'

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  base: { service: 'iso8583-middleware' },
})

/** Create a child logger with a fixed correlation context (traceId, txId, etc.) */
export function childLogger(ctx: Record<string, unknown>) {
  return logger.child(ctx)
}
