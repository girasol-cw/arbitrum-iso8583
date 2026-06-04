/**
 * observability/metrics.ts
 * Contadores en memoria simples. Para MVP no necesitamos Prometheus:
 * estos valores se exponen en GET /metrics como JSON plano y se loguean
 * con pino. Si en el futuro se quiere Prometheus, basta reemplazar este
 * módulo con prom-client sin cambiar los importadores.
 */

const _counts: Record<string, number> = {}

function inc(name: string): void {
  _counts[name] = (_counts[name] ?? 0) + 1
}

/** Retorna copia de todos los contadores (para el endpoint /metrics). */
export function getMetrics(): Record<string, number> {
  return { ..._counts }
}

// ── Contadores nombrados ──────────────────────────────────────────────────────
// Se mantiene la misma interfaz que prom-client para poder migrarlo fácil.

export const isoMessagesReceived = { inc: () => inc('iso_messages_received') }
export const isoMessagesRouted   = { inc: () => inc('iso_messages_routed') }
export const isoDuplicates       = { inc: () => inc('iso_duplicates') }
export const txSubmitted         = { inc: () => inc('tx_submitted') }
export const txConfirmed         = { inc: () => inc('tx_confirmed') }
export const errorClassified     = { inc: () => inc('error_classified') }

// Stub de Gauge/Histogram para que los importadores no fallen
export const relayerNonce = { set: (_v: number) => {} }
export const txLatency    = { observe: (_l: object, _v: number) => {} }
