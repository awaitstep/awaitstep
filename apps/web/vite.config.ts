import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [tailwindcss(), tsConfigPaths(), tanstackStart(), react()],
  optimizeDeps: {
    include: ['@monaco-editor/react', 'monaco-editor'],
  },
  ssr: {
    noExternal: isProduction ? true : undefined,
    external: ['@monaco-editor/react', 'monaco-editor'],
  },
})
