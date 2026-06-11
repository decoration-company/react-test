import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __EDITOR_GIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'),
    __EDITOR_DEPLOYMENT_ID__: JSON.stringify(process.env.VERCEL_DEPLOYMENT_ID ?? 'local'),
  },
  server: {
    allowedHosts: ['.ngrok-free.dev', '.trycloudflare.com'],
  },
})
