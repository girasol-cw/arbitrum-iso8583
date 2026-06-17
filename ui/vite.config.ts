import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const backendTarget = env.VITE_BACKEND_URL || 'http://localhost:3100'
  const backendWsTarget = env.VITE_BACKEND_WS_URL || backendTarget.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      proxy: {
        // ── REST API ──────────────────────────────────────────────────────────
        // Routes /api/* → backend target (strips the /api prefix)
        '/api': {
          target:       backendTarget,
          changeOrigin: true,
          rewrite:      (path) => path.replace(/^\/api/, ''),
        },

        // ── POS Simulator WebSocket bridge (DEVELOPMENT / TESTING ONLY) ──────
        //
        // In production, real POS terminals speak raw TCP directly to port 5000.
        // Browsers cannot open raw TCP sockets, so during development we proxy
        // WebSocket connections at /ws/pos through the Vite dev-server to the
        // backend's posSimBridge, which relays the binary ISO 8583 frames to
        // the isoTcpServer over a loopback TCP connection.
        '/ws/pos': {
          target: backendWsTarget,
          ws:     true,
          // Do NOT rewrite the path – backend expects exactly /ws/pos
        },
      },
    },
  }
})
