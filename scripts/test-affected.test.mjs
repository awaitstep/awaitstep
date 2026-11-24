import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupByPackage, parseArgs } from './test-affected.mjs'

const DIRS = ['apps/web', 'apps/api', 'packages/db', 'packages/ir']

test('groups changed source files by their package, relative to it', () => {
  const groups = groupByPackage(
    ['apps/web/src/a.tsx', 'apps/web/src/b.test.ts', 'packages/ir/src/c.ts'],
    DIRS,
  )
  assert.deepEqual(Object.fromEntries(groups), {
    'apps/web': ['src/a.tsx', 'src/b.test.ts'],
    'packages/ir': ['src/c.ts'],
  })
})

test('leaves the db package out unless asked for it', () => {
  const files = ['packages/db/src/queries.ts']
  assert.equal(groupByPackage(files, DIRS).size, 0)
  assert.deepEqual(groupByPackage(files, DIRS, { withDb: true }).get('packages/db'), [
    'src/queries.ts',
  ])
})

test('skips files outside tested packages and files that are not source', () => {
  const groups = groupByPackage(['README.md', 'plan/x.ts', 'apps/web/notes.md'], DIRS)
  assert.equal(groups.size, 0)
})

test('matches the longest package directory, so a nested package wins', () => {
  const groups = groupByPackage(['apps/web/inner/src/x.ts'], [...DIRS, 'apps/web/inner'])
  assert.deepEqual([...groups.keys()], ['apps/web/inner'])
})

test('reads --base and --with-db', () => {
  assert.deepEqual(parseArgs(['--base', 'origin/dev', '--with-db']), {
    base: 'origin/dev',
    withDb: true,
  })
  assert.deepEqual(parseArgs([]), { base: undefined, withDb: false })
})
