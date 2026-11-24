import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { securityHeaders, securityPlugin } from '../shared/security.js'

export default defineConfig({
  plugins: [
    securityPlugin(),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5174,
    headers: securityHeaders,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '../*']
    }
  },
  preview: {
    host: true,
    port: 5174,
    headers: securityHeaders
  },
  build: {
    sourcemap: false
  }
})
