import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Alvo do backend para o proxy de desenvolvimento.
// Pode ser sobrescrito pela variavel de ambiente VITE_DEV_API_TARGET, se necessario.
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Atalho "@" para a pasta src (usado tambem pelo shadcn/ui)
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Em desenvolvimento, encaminha as chamadas "/api" para o backend,
      // evitando a necessidade de configurar CORS. Em producao, a API deve
      // ser servida na mesma origem ou configurada via VITE_API_BASE_URL.
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
