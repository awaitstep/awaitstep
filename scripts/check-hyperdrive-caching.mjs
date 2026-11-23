#!/usr/bin/env node
// Reads `wrangler hyperdrive get <id>` output on stdin and fails unless query caching is
// off: the app reads its own writes, and a cached read can be 60 s old.
import { readFileSync } from 'node:fs'

export function cachingDisabled(output) {
  const start = output.indexOf('{')
  if (start === -1) throw new Error('No Hyperdrive config in the output')
  const config = JSON.parse(output.slice(start))
  return config.caching?.disabled === true
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (!cachingDisabled(readFileSync(0, 'utf8'))) {
      console.error(
        '::error::Hyperdrive caching is on. Run `wrangler hyperdrive update <id> --caching-disabled`.',
      )
      process.exit(1)
    }
  } catch (err) {
    console.error(`::error::Could not read the Hyperdrive config: ${err.message}`)
    process.exit(1)
  }
}
