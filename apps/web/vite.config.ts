/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'
const isCloudflare = process.env.BUILD_TARGET === 'cf'
// Vitest extends this config; the Cloudflare plugin starts a worker runner that dies there.
const isTest = Boolean(process.env.VITEST)

// Imported only for a Cloudflare build: it pulls in wrangler, whose undici
// wants a Node newer than the one tests may run on. A plain dev server or a
// test run never needs it.
const plugins = [tailwindcss(), tanstackStart(), react()]
if (isCloudflare && !isTest) {
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  plugins.unshift(cloudflare({ viteEnvironment: { name: 'ssr' } }))
}

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
  plugins,
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
          include: ['src/**/*.test.ts'],
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
          // userEvent-driven dialogs run past vitest's 5s default when the whole suite shares the CPU.
          testTimeout: 15_000,
        },
      },
    ],
  },
})
