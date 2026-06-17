const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim()
const rawBackendWsUrl = import.meta.env.VITE_BACKEND_WS_URL?.trim()

function withoutTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function currentHostWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/pos`
}

export const BACKEND_HTTP_BASE = rawBackendUrl ? withoutTrailingSlash(rawBackendUrl) : '/api'

export function backendWsUrl(): string {
  if (rawBackendWsUrl) return withoutTrailingSlash(rawBackendWsUrl)

  if (rawBackendUrl?.startsWith('http://') || rawBackendUrl?.startsWith('https://')) {
    return `${withoutTrailingSlash(rawBackendUrl).replace(/^http/, 'ws')}/ws/pos`
  }

  return currentHostWsUrl()
}
