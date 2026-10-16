import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5191,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5192 } : undefined,
    watch: {
      // Bắt buộc trên Windows để Vite không theo dõi thư mục build của Rust (gây lỗi EBUSY file lock)
      ignored: ['**/src-tauri/**']
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./engine', import.meta.url)),
      '@mascot': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
