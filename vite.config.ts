import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // Runtime-generated adventure media is served from /assets by FastAPI.
    // Keep Vite chunks in a separate namespace so the two mounts cannot clash.
    assetsDir: 'static',
  },
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'src/shared') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:8000', changeOrigin: true },
      '/assets': { target: process.env.VITE_API_TARGET || 'http://localhost:8000', changeOrigin: true },
    },
  },
})
