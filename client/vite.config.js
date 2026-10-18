import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, Vite serves the UI on :5173 and forwards API + WebSocket traffic to the
// Node server on :3001, so the browser sees one origin and the session cookie just works.
const target = 'http://localhost:3001'
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/sync': { target, ws: true },
      '/signal': { target, ws: true },
    },
  },
})
