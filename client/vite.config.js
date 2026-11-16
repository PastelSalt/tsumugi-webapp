import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The legal pages render the Markdown drafts in ../docs, which sit outside the client root.
    fs: { allow: ['..'] },
    // The API runs on this PC (see Server/). Proxying keeps the browser on one origin, so session cookies stay first-party.
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
})
