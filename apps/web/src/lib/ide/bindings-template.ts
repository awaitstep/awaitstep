/** The provider profile the IDE's Bindings item creates. */
export const CLOUDFLARE_BINDINGS_PATH = 'providers/cloudflare.ts'

export const CLOUDFLARE_BINDINGS_SOURCE = `import { defineCloudflare } from '#awaitstep/cloudflare'

export default defineCloudflare({
  bindings: {
    // KV_USERS: { kind: 'kv' },
    // DB_MAIN: { kind: 'd1' },
    // BUCKET_ASSETS: { kind: 'r2', bucket: 'assets' },
    // QUEUE_JOBS: { kind: 'queue', queue: 'jobs' },
  },
})
`
