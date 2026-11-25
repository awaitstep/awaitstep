/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { extensionsPlugin } from './src/extensions/vite-plugin.ts'

const isProduction = process.env.NODE_ENV === 'production'
const isCloudflare = process.env.BUILD_TARGET === 'cf'
// Vitest extends this config; the Cloudflare plugin starts a worker runner that dies there.
const isTest = Boolean(process.env.VITEST)

// Extensions plugged in from outside this repo, or none (src/extensions/stub.ts).
const extensions = extensionsPlugin({
  stub: fileURLToPath(new URL('./src/extensions/stub.ts', import.meta.url)),
})
const plugins = [extensions, tailwindcss(), tanstackStart(), react()]
// Imported only for a Cloudflare build: it pulls in wrangler, whose undici
// wants a Node newer than the one tests may run on. A plain dev server or a
// test run never needs it.
if (isCloudflare && !isTest) {
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  plugins.unshift(cloudflare({ viteEnvironment: { name: 'ssr' } }))
}

/** The app's addresses besides localhost (`CORS_ORIGIN`), which the dev server must answer to. */
const appHosts = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => new URL(origin).hostname)

export default defineConfig({
  server: {
    port: 3000,
    allowedHosts: appHosts,
    proxy: {
      '/api/': {
        // Override when the API dev server runs on a non-default port.
        // API_URL (the SSR fetch target) doubles as a fallback since both
        // point at the same API server in dev.
        target: process.env.API_PROXY_TARGET ?? process.env.API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        // changeOrigin rewrites Host, so the API learns the address the app
        // was opened at from these; a proxy in front (Caddy) already set them.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (!req.headers['x-forwarded-host'] && req.headers.host) {
              proxyReq.setHeader('x-forwarded-host', req.headers.host)
              proxyReq.setHeader('x-forwarded-proto', 'http')
            }
          })
        },
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
  // Monaco's language workers are ES modules (lib/monaco/bundled-monaco.ts).
  worker: {
    format: 'es',
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
