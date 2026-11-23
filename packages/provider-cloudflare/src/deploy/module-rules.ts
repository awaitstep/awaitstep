import type { WorkerModuleType } from './deployer.js'

/**
 * The files a `--no-bundle` deploy attaches beside the entry, by wrangler's
 * default module rules (the generated config sets none): text for `.txt`,
 * `.html` and `.sql`, a buffer for `.bin`, compiled Wasm for `.wasm`. Other
 * files in the build directory — wrangler's README, source maps — are not
 * uploaded, and the bundler emits no JavaScript besides the entry.
 */
const ATTACHED: Readonly<Record<string, WorkerModuleType>> = {
  '.txt': 'text',
  '.html': 'text',
  '.sql': 'text',
  '.bin': 'data',
  '.wasm': 'compiled-wasm',
}

/** How the upload would attach the file at `path`, or `null` when it would not. */
export function attachedModuleType(path: string): WorkerModuleType | null {
  const dot = path.lastIndexOf('.')
  if (dot <= path.lastIndexOf('/')) return null
  return ATTACHED[path.slice(dot)] ?? null
}
