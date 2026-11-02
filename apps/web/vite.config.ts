/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { validateReleaseNotes } from './vite-plugins/validate-release-notes'

const isProduction = process.env.NODE_ENV === 'production'
const isCloudflare = process.env.BUILD_TARGET === 'cf'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/': {
        // Override when the API dev server runs on a non-default port.
        // API_URL (the SSR fetch target) doubles as a fallback since both
        // point at the same API server in dev.
        target: process.env.API_PROXY_TARGET ?? process.env.API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    ...(isCloudflare ? [cloudflare({ viteEnvironment: { name: 'ssr' } })] : []),
    validateReleaseNotes(fileURLToPath(new URL('./release-notes', import.meta.url))),
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
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'vite-plugins/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['src/__tests__/setup-dom.ts'],
        },
      },
    ],
  },
})
