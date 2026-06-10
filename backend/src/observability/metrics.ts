/**
 * observability/metrics.ts
 * Simple in-memory counters. For the MVP we do not need Prometheus:
 * these values are exposed by GET /metrics as plain JSON and logged with pino.
 * If we want Prometheus later, this module can be replaced with prom-client
 * without changing importers.
 */

const _counts: Record<string, number> = {}

function inc(name: string): void {
  _counts[name] = (_counts[name] ?? 0) + 1
}

/** Return a copy of all counters for the /metrics endpoint. */
export function getMetrics(): Record<string, number> {
  return { ..._counts }
}

// ── Named counters ────────────────────────────────────────────────────────────
// Keep the same interface as prom-client so migration stays easy.

type Labels = Record<string, string | number>

export const isoMessagesReceived = { inc: (_labels?: Labels) => inc('iso_messages_received') }
export const isoMessagesRouted   = { inc: (_labels?: Labels) => inc('iso_messages_routed') }
export const isoDuplicates       = { inc: (_labels?: Labels) => inc('iso_duplicates') }
export const txSubmitted         = { inc: (_labels?: Labels) => inc('tx_submitted') }
export const txConfirmed         = { inc: (_labels?: Labels) => inc('tx_confirmed') }
export const errorClassified     = { inc: (_labels?: Labels) => inc('error_classified') }

// Gauge/Histogram stubs so importers do not fail.
export const relayerNonce = { set: (_v: number) => {} }
export const txLatency    = { observe: (_l: object, _v: number) => {} }
