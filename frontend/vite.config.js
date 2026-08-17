import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5276,
    proxy: {
      '/api': {
        target: 'http://localhost:8101',
        changeOrigin: true,
      },
    },
  },
})
