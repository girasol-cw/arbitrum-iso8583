import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ── REST API ──────────────────────────────────────────────────────────
      // Routes /api/* → http://localhost:3100/* (strips the /api prefix)
      '/api': {
        target:      'http://localhost:3100',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api/, ''),
      },

      // ── POS Simulator WebSocket bridge (DEVELOPMENT / TESTING ONLY) ──────
      //
      // In production, real POS terminals speak raw TCP directly to port 5000.
      // Browsers cannot open raw TCP sockets, so during development we proxy
      // WebSocket connections at /ws/pos through the Vite dev-server to the
      // backend's posSimBridge, which relays the binary ISO 8583 frames to
      // the isoTcpServer over a loopback TCP connection.
      //
      //  Browser → ws://localhost:5173/ws/pos
      //          → Vite proxy → ws://localhost:3100/ws/pos
      //          → posSimBridge → TCP:5000
      //          → isoTcpServer → contract on-chain
      '/ws/pos': {
        target:    'ws://localhost:3100',
        ws:        true,
        // Do NOT rewrite the path – backend expects exactly /ws/pos
      },
    },
  },
})
