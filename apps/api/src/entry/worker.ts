import { createWorker } from './worker-app.js'

// Re-export Sandbox DO class — required by wrangler when containers config is enabled.
// If the SANDBOX binding is not configured, this export is unused and harmless.
export { Sandbox } from '@cloudflare/sandbox'

export default createWorker()
