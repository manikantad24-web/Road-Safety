import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API is proxied, so the browser talks to one origin and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { leaflet: ['leaflet', 'react-leaflet'], charts: ['recharts'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    env: { VITE_API_BASE_URL: process.env.SMOKE_API_URL || 'http://127.0.0.1:8001' },
    testTimeout: 20000,
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } },
  },
})
