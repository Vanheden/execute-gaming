import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy auth + api calls to the Express backend so everything is
    // same-origin in dev (cookies work, no CORS). Backend runs on :3001.
    proxy: {
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
