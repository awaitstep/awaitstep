import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), react()],
  optimizeDeps: {
    include: ['@monaco-editor/react', 'monaco-editor'],
  },
  ssr: {
    noExternal: isProduction ? true : undefined,
    external: ['@monaco-editor/react', 'monaco-editor'],
  },
})
