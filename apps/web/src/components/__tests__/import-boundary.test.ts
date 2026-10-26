import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// Kit directories hold presentational components only: props in, callbacks out.
const KIT_DIRS = ['components/ui', 'components/shell']

const FORBIDDEN_PACKAGES = ['@tanstack/react-router', '@tanstack/react-query']
const FORBIDDEN_SRC_PREFIXES = [
  'stores/',
  'data/',
  'mocks/',
  'wrappers/',
  'contexts/',
  'lib/api-client',
  'lib/auth-client',
]

// These predate the kit and serve the old pages; they are deleted in the
// backend phase together with those pages. They are exempt as kit files, but
// a kit file that imports one is still caught, because the check follows
// imports through every file it reaches. Never add to this list.
const LEGACY_ALLOWED = new Set([
  'components/ui/breadcrumb.tsx',
  'components/ui/page-header.tsx',
  'components/ui/guarded-link.tsx',
  // Reads the theme store through useMonacoTheme; an app widget rather than a
  // kit component. Leaves this list when the theme is passed in as a prop.
  'components/ui/code-editor.tsx',
])

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

type ReadSource = (file: string) => string | undefined

function readFromDisk(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

function resolveRelative(from: string, spec: string, read: ReadSource): string | undefined {
  const base = resolve(dirname(from), spec)
  return EXTENSIONS.map((ext) => base + ext).find((candidate) => read(candidate) !== undefined)
}

function isForbidden(from: string, spec: string): boolean {
  if (FORBIDDEN_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) return true
  if (!spec.startsWith('.')) return false
  const target = relative(SRC, resolve(dirname(from), spec))
  return FORBIDDEN_SRC_PREFIXES.some((prefix) => target.startsWith(prefix))
}

/**
 * Walks the relative-import graph from `entry` and returns every forbidden
 * import it reaches, as "file → specifier" (paths relative to src).
 */
function forbiddenImports(entry: string, read: ReadSource = readFromDisk): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = read(file) ?? ''
    for (const [, spec] of source.matchAll(IMPORT_PATTERN)) {
      if (isForbidden(file, spec!)) {
        found.push(`${relative(SRC, file)} → ${spec}`)
        continue
      }
      if (!spec!.startsWith('.')) continue
      const next = resolveRelative(file, spec!, read)
      if (next) queue.push(next)
    }
  }
  return found
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('kit import boundary', () => {
  const files = KIT_DIRS.flatMap((dir) => listSourceFiles(join(SRC, dir))).filter(
    (file) => !LEGACY_ALLOWED.has(relative(SRC, file)),
  )

  it.each(files.map((file) => [relative(SRC, file), file]))(
    '%s reaches no router, query, store, mock, wrapper, context or API client',
    (_name, file) => {
      expect(forbiddenImports(file)).toEqual([])
    },
  )

  it('flags direct router and app-state imports', () => {
    const entry = join(SRC, 'components/shell/example.tsx')
    const files: Record<string, string> = {
      [entry]: [
        "import { Link } from '@tanstack/react-router'",
        "import { useQuery } from '@tanstack/react-query'",
        "import { useAuthStore } from '../../stores/auth-store'",
        "import { apiClient } from '../../lib/api-client'",
        "const lazy = import('../../mocks/dashboard/projects')",
        "import { cn } from '../../lib/utils'",
      ].join('\n'),
      [join(SRC, 'lib/utils.ts')]: "import { clsx } from 'clsx'",
    }
    expect(forbiddenImports(entry, (file) => files[file])).toEqual([
      'components/shell/example.tsx → @tanstack/react-router',
      'components/shell/example.tsx → @tanstack/react-query',
      'components/shell/example.tsx → ../../stores/auth-store',
      'components/shell/example.tsx → ../../lib/api-client',
      'components/shell/example.tsx → ../../mocks/dashboard/projects',
    ])
  })

  it('flags app state reached through a hook or a legacy kit file', () => {
    const entry = join(SRC, 'components/shell/example.tsx')
    const files: Record<string, string> = {
      [entry]: [
        "import { useDeployStream } from '../../hooks/use-deploy-stream'",
        "import { GuardedLink } from '../ui/guarded-link'",
        "import { useMounted } from '../../hooks/use-mounted'",
      ].join('\n'),
      [join(SRC, 'hooks/use-deploy-stream.ts')]:
        "import { usePollingStore } from '../stores/polling-store'",
      [join(SRC, 'components/ui/guarded-link.tsx')]:
        "import { Link } from '@tanstack/react-router'",
      [join(SRC, 'hooks/use-mounted.ts')]: "import { useState } from 'react'",
    }
    expect(forbiddenImports(entry, (file) => files[file])).toEqual([
      'hooks/use-deploy-stream.ts → ../stores/polling-store',
      'components/ui/guarded-link.tsx → @tanstack/react-router',
    ])
  })
})
