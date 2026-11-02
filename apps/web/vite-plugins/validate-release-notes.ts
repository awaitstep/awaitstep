import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { loadReleaseNotes } from '../src/lib/release-note-fragments'

/** The fragment files in `dir`, path to raw text, as `import.meta.glob` hands them to the app. */
function readFragments(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => [file, readFileSync(join(dir, file), 'utf8')]),
  )
}

/**
 * Fails `vite build` on a release-note fragment that does not parse. At runtime a bad
 * fragment is only left out, so without this a typo would ship as a missing note.
 */
export function validateReleaseNotes(dir: string): Plugin {
  return {
    name: 'validate-release-notes',
    apply: 'build',
    buildStart() {
      const files = readFragments(dir)
      try {
        loadReleaseNotes(files, Object.keys(files).length)
      } catch (error) {
        this.error((error as Error).message)
      }
    },
  }
}
