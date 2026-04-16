import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

const isProduction = process.env.NODE_ENV === 'production'
const isCloudflare = process.env.BUILD_TARGET === 'cf'

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
  plugins: [
    ...(isCloudflare ? [cloudflare({ viteEnvironment: { name: 'ssr' } })] : []),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  optimizeDeps: {
    include: ['@monaco-editor/react', 'monaco-editor'],
  },
  ssr: {
    noExternal: isProduction ? true : undefined,
    // Monaco is browser-only. On Node SSR we mark it external; on CF we rely on
    // components loading it lazily/client-side (no externals allowed by CF plugin).
    ...(isCloudflare ? {} : { external: ['@monaco-editor/react', 'monaco-editor'] }),
  },
})
