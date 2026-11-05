import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  handlerMenuItems,
  importSpecifier,
  projectUsage,
  resolveNewPath,
  resolveTargetFolder,
  rootConfigMenuItems,
  usageStatus,
} from '../ide/project'

const projectPaths = new Set(['lib/payments/refund.ts', 'lib/retry.ts', 'package.json'])

describe('resolveTargetFolder', () => {
  it('uses a selected folder', () => {
    const selected = { path: 'lib/payments', kind: 'dir', section: 'project' } as const
    expect(resolveTargetFolder({ selected, activePath: 'lib/retry.ts', projectPaths })).toBe(
      'lib/payments',
    )
  })

  it("uses a selected file's folder over the active file", () => {
    const selected = { path: 'lib/payments/refund.ts', kind: 'file', section: 'project' } as const
    expect(resolveTargetFolder({ selected, activePath: 'package.json', projectPaths })).toBe(
      'lib/payments',
    )
  })

  it("falls back to the active file's folder", () => {
    expect(resolveTargetFolder({ selected: null, activePath: 'lib/retry.ts', projectPaths })).toBe(
      'lib',
    )
  })

  it('falls back to the root with nothing selected or an active generated file', () => {
    expect(resolveTargetFolder({ selected: null, activePath: null, projectPaths })).toBe('')
    expect(resolveTargetFolder({ selected: null, activePath: 'worker.ts', projectPaths })).toBe('')
  })

  it('uses the root for anything selected under Generated', () => {
    const selected = { path: 'nodes', kind: 'dir', section: 'generated' } as const
    expect(resolveTargetFolder({ selected, activePath: 'lib/retry.ts', projectPaths })).toBe('')
  })
})

describe('resolveNewPath', () => {
  it('places a bare name in the target folder', () => {
    expect(resolveNewPath('lib/payments', 'charge.ts')).toBe('lib/payments/charge.ts')
    expect(resolveNewPath('', 'charge.ts')).toBe('charge.ts')
  })

  it('lets a typed path with a slash win over the target', () => {
    expect(resolveNewPath('lib/payments', 'config/env.ts')).toBe('config/env.ts')
  })

  it('keeps a Folder… path inside the target even with slashes', () => {
    expect(resolveNewPath('lib', 'billing/index.ts', true)).toBe('lib/billing/index.ts')
  })

  it('is empty for blank input', () => {
    expect(resolveNewPath('lib', '   ')).toBe('')
  })
})

describe('importSpecifier', () => {
  it('drops .ts and .js and prefixes #app/', () => {
    expect(importSpecifier('lib/payments/refund.ts')).toBe('#app/lib/payments/refund')
    expect(importSpecifier('util.js')).toBe('#app/util')
  })

  it('keeps explicit module extensions', () => {
    expect(importSpecifier('lib/a.mts')).toBe('#app/lib/a.mts')
  })

  it('offers nothing for data files and handler modules', () => {
    expect(importSpecifier('config.json')).toBeNull()
    expect(importSpecifier('handlers/fetch.ts')).toBeNull()
  })
})

describe('project usage', () => {
  it('counts files and UTF-8 bytes', () => {
    expect(projectUsage([{ source: 'abc' }, { source: 'é' }])).toEqual({ files: 2, bytes: 5 })
  })

  it('formats sizes in decimal units like the limits', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(412_000)).toBe('412 KB')
    expect(formatBytes(1_300_000)).toBe('1.3 MB')
    expect(formatBytes(2_000_000)).toBe('2 MB')
    expect(formatBytes(999_800)).toBe('1 MB')
  })

  it('reads normal, near and at the limit', () => {
    const normal = usageStatus({ files: 23, bytes: 412_000 })
    expect(normal.level).toBe('ok')
    expect(normal.label).toBe('23 of 100 files · 412 KB of 2 MB')
    expect(normal.limitReason).toBeNull()
    expect(usageStatus({ files: 90, bytes: 0 }).level).toBe('warn')
    expect(usageStatus({ files: 10, bytes: 1_800_000 }).level).toBe('warn')
    expect(usageStatus({ files: 89, bytes: 1_799_999 }).level).toBe('ok')
  })

  it('is full, and refuses new files, at 100 files', () => {
    const full = usageStatus({ files: 100, bytes: 1_400_000 })
    expect(full.level).toBe('full')
    expect(full.atFileLimit).toBe(true)
    expect(full.limitReason).toMatch(/100 files/)
    expect(usageStatus({ files: 5, bytes: 2_000_000 }).level).toBe('full')
    expect(usageStatus({ files: 5, bytes: 2_000_000 }).atFileLimit).toBe(false)
  })
})

describe('New menu availability', () => {
  const byId = (items: ReturnType<typeof handlerMenuItems>) =>
    Object.fromEntries(items.map((i) => [i.id, i.disabledReason]))

  it('offers every handler in a project without any', () => {
    expect(byId(handlerMenuItems(['lib/a.ts']))).toEqual({
      fetch: null,
      scheduled: null,
      queue: null,
      shared: null,
    })
  })

  it('disables a handler that exists, saying which file', () => {
    const reasons = byId(handlerMenuItems(['handlers/fetch.ts', 'handlers/shared.ts']))
    expect(reasons.fetch).toBe('fetch.ts exists')
    expect(reasons.shared).toBe('shared.ts exists')
    expect(reasons.scheduled).toBeNull()
  })

  it('treats another extension of the same handler as existing', () => {
    expect(byId(handlerMenuItems(['handlers/scheduled.mjs'])).scheduled).toBe(
      'scheduled.mjs exists',
    )
  })

  it('disables handler modules while handlers.ts is in use, but not shared helpers', () => {
    const reasons = byId(handlerMenuItems(['handlers.ts']))
    expect(reasons.fetch).toBe('handlers.ts is in use')
    expect(reasons.queue).toBe('handlers.ts is in use')
    expect(reasons.shared).toBeNull()
  })

  it('asks for a name for queue consumers and writes the rest directly', () => {
    const items = handlerMenuItems([])
    expect(items.find((i) => i.id === 'queue')).toMatchObject({ prompt: 'handlers/queue/' })
    expect(items.find((i) => i.id === 'fetch')).toMatchObject({ path: 'handlers/fetch.ts' })
  })

  it('disables root config files that exist', () => {
    const items = rootConfigMenuItems(['package.json'])
    expect(items.map((i) => [i.path, i.disabledReason])).toEqual([
      ['package.json', 'package.json exists'],
      ['tsconfig.json', null],
    ])
    expect(() => JSON.parse(items[1]!.source!)).not.toThrow()
  })
})

describe('shared helpers availability', () => {
  it('is taken by a shared module in any compiled extension, not just shared.ts', () => {
    const shared = (existing: string[]) =>
      handlerMenuItems(existing).find((item) => item.id === 'shared')?.disabledReason
    expect(shared([])).toBeNull()
    expect(shared(['handlers/shared.ts'])).toBe('shared.ts exists')
    expect(shared(['handlers/shared.js'])).toBe('shared.js exists')
    expect(shared(['handlers/shared.mjs'])).toBe('shared.mjs exists')
    expect(shared(['handlers/shared-extra.ts'])).toBeNull()
  })
})
