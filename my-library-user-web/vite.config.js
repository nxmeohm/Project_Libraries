import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { securityPlugin, commonServerOptions } from '../shared/security.js'

export default defineConfig({
  plugins: [securityPlugin(), react(), tailwindcss()],
  server: { ...commonServerOptions, port: 5174 },
  preview: { port: 5174, headers: commonServerOptions.headers },
  build: { sourcemap: false }
})
