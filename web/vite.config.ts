import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * В dev-режиме фронтенд проксирует /api и /up|/tiles на локально запущенный
 * стенд (mock/server.mjs или живой Cloudflare Tunnel).
 * В продакшене /api, /up, /tiles обслуживает Pages Function (см. cloudflare/).
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/up': 'http://127.0.0.1:8080',
      '/tiles': 'http://127.0.0.1:8080',
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
