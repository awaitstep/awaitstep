import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A response must never be a whole row. `select()` and `returning()` without
// a column list read every column, so a new field — a secret, an encrypted
// blob, another person's address — leaves the API the moment it is added to
// the table. The detail reads below are internal (a row judged, then
// serialized explicitly), or are allowed for a stated reason.

const ADAPTERS = fileURLToPath(new URL('../adapters', import.meta.url))

/** Files whose no-argument reads are internal or explicit at the response edge. */
const ALLOWED = new Map<string, string>([
  ['atomic.ts', 'doc comment, not a call'],
  ['insert-where.ts', 'shared INSERT helper; the caller picks the returned columns'],
  ['workflows.ts', 'row reads feed checks and are serialized by workflow-records'],
  ['projects.ts', 'detail row for a write answer, serialized at the route'],
  ['versions.ts', 'detail row whose response maps explicit columns'],
  ['workspaces.ts', 'detail row whose response maps explicit columns'],
  ['runs.ts', 'detail row and sync rows, consumed internally'],
  ['env-vars.ts', 'rows are decrypted then mapped by the route'],
  ['workflow-files.ts', 'file rows are written and read whole by the editor'],
  ['test-sessions.ts', 'session rows are consumed by the runner, not returned'],
  ['api-keys.ts', 'rows are mapped by keyRecord before the response'],
  ['deployment-configs.ts', 'config rows are internal and returned whole by design'],
  ['connections.ts', 'rows feed writes and are summarized by connectionSummary'],
  ['installed-nodes.ts', 'bundle rows are internal; the list maps explicit columns'],
  ['workspace-runs.ts', 'CTE and page rows are mapped by run-records'],
])

const CALL = /\.(select|returning)\(\s*\)/g

describe('adapter column lists', () => {
  const files = readdirSync(ADAPTERS).filter((name) => name.endsWith('.ts'))

  it('reads no whole row in an adapter that has not been allowed', () => {
    const offenders = files
      .filter((name) => !ALLOWED.has(name))
      .flatMap((name) => {
        const source = readFileSync(join(ADAPTERS, name), 'utf8')
        return [...source.matchAll(CALL)].map(() => name)
      })
    expect(offenders, '.select()/.returning() without a column list').toEqual([])
  })

  it('keeps the allow-list deliberate: every entry still needs its reason', () => {
    for (const [name, reason] of ALLOWED) {
      expect(files, `${name} is gone from the adapters`).toContain(name)
      expect(reason.trim().length, `${name} needs a reason`).toBeGreaterThan(0)
    }
  })
})
