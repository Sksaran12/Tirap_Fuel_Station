import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        leads: 'leads/index.html',
      },
    },
  },
})
