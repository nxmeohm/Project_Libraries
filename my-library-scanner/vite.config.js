import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { securityPlugin, commonServerOptions } from '../shared/security.js'

export default defineConfig({
  plugins: [securityPlugin(), react(), tailwindcss(), basicSsl()],
  server: {
    ...commonServerOptions,
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
  },
  preview: { port: 5175, headers: commonServerOptions.headers },
  build: { sourcemap: false }
})
