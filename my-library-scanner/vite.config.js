import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { securityHeaders, securityPlugin } from '../shared/security.js'

export default defineConfig({
  plugins: [
    securityPlugin(),
    react(),
    tailwindcss(),
    basicSsl()
  ],
  server: {
    port: 5175,
    host: true,
    headers: securityHeaders,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '../*']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 5175,
    host: true,
    headers: securityHeaders
  },
  build: {
    sourcemap: false
  }
})
