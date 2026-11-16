import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer' // 1. นำเข้า visualizer

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 2. ใส่ plugin visualizer เข้าไป
    visualizer({
      open: true,          // เปิดเบราว์เซอร์โชว์รายงานอัตโนมัติหลัง build เสร็จ
      filename: 'stats.html', // ชื่อไฟล์รายงานผลลัพธ์
      gzipSize: true,      // คำนวณขนาดไฟล์หลังบีบอัดแบบ Gzip
      brotliSize: true,    // คำนวณขนาดไฟล์หลังบีบอัดแบบ Brotli
    }),
  ],
})