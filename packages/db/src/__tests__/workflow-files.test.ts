import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import type { UpsertWorkflowFileData } from '../types.js'

const now = '2026-10-19T00:00:00.000Z'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE workflows (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, kind text NOT NULL DEFAULT 'workflow', description text, trigger_code text, current_version_id text, created_by text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workflow_files (
      id text PRIMARY KEY, workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      path text NOT NULL, source text NOT NULL, hash text NOT NULL, size integer NOT NULL,
      created_at text NOT NULL, updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX idx_workflow_files_path ON workflow_files (workflow_id, path);
    INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-1', 'p-1', 'One', '${now}', '${now}');
    INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-2', 'p-1', 'Two', '${now}', '${now}');
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function row(overrides: Partial<UpsertWorkflowFileData> = {}): UpsertWorkflowFileData {
  return {
    id: 'f-1',
    workflowId: 'wf-1',
    path: 'config/env.ts',
    source: 'export const v = 1',
    hash: 'h1',
    size: 18,
    ...overrides,
  }
}

describe('workflow files adapter', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('upserts by (workflow, path), keeping the original id and createdAt', async () => {
    const first = await db.adapter.upsertWorkflowFile(row())
    expect(first).toMatchObject({ id: 'f-1', path: 'config/env.ts', hash: 'h1', size: 18 })

    const second = await db.adapter.upsertWorkflowFile(
      row({ id: 'f-2', source: 'export const v = 2', hash: 'h2' }),
    )
    expect(second).toMatchObject({
      id: 'f-1',
      source: 'export const v = 2',
      hash: 'h2',
      createdAt: first.createdAt,
    })
    expect(await db.adapter.listWorkflowFiles('wf-1')).toHaveLength(1)
  })

  it('bulk-upserts in one statement and returns every row', async () => {
    const rows = await db.adapter.upsertWorkflowFiles([
      row({ id: 'a', path: 'b.ts' }),
      row({ id: 'b', path: 'a.ts' }),
    ])
    expect(rows.map((r) => r.path).sort()).toEqual(['a.ts', 'b.ts'])
    expect(await db.adapter.upsertWorkflowFiles([])).toEqual([])
  })

  it('lists a workflow’s files ordered by path and never another workflow’s', async () => {
    await db.adapter.upsertWorkflowFiles([
      row({ id: '1', workflowId: 'wf-1', path: 'z.ts' }),
      row({ id: '2', workflowId: 'wf-1', path: 'a.ts' }),
      row({ id: '3', workflowId: 'wf-2', path: 'b.ts' }),
    ])
    expect((await db.adapter.listWorkflowFiles('wf-1')).map((f) => f.path)).toEqual([
      'a.ts',
      'z.ts',
    ])
    expect(await db.adapter.getWorkflowFile('wf-1', 'b.ts')).toBeNull()
    expect(await db.adapter.getWorkflowFile('wf-2', 'b.ts')).toMatchObject({ path: 'b.ts' })
  })

  it('replaces conditionally on the stored hash in a single statement', async () => {
    await db.adapter.upsertWorkflowFile(row())
    expect(
      await db.adapter.updateWorkflowFileIfMatches(row({ source: 'v3', hash: 'h3' }), 'stale'),
    ).toBeNull()
    expect(
      await db.adapter.updateWorkflowFileIfMatches(row({ path: 'missing.ts' }), '*'),
    ).toBeNull()
    const updated = await db.adapter.updateWorkflowFileIfMatches(
      row({ id: 'ignored', source: 'v3', hash: 'h3' }),
      'h1',
    )
    expect(updated).toMatchObject({ id: 'f-1', source: 'v3', hash: 'h3' })
    expect(
      await db.adapter.updateWorkflowFileIfMatches(row({ source: 'v4', hash: 'h4' }), '*'),
    ).toMatchObject({ hash: 'h4' })
  })

  it('replaceAll swaps the whole set', async () => {
    await db.adapter.upsertWorkflowFiles([row({ id: '1', path: 'old.ts' })])
    const rows = await db.adapter.replaceWorkflowFiles('wf-1', [row({ id: '2', path: 'new.ts' })])
    expect(rows.map((r) => r.path)).toEqual(['new.ts'])
    expect((await db.adapter.listWorkflowFiles('wf-1')).map((f) => f.path)).toEqual(['new.ts'])
    expect(await db.adapter.replaceWorkflowFiles('wf-1', [])).toEqual([])
    expect(await db.adapter.listWorkflowFiles('wf-1')).toEqual([])
  })

  it('creates only when the path is free, in one statement', async () => {
    const created = await db.adapter.createWorkflowFile(row({ id: '1', source: 'first' }))
    expect(created?.source).toBe('first')
    expect(await db.adapter.createWorkflowFile(row({ id: '2', source: 'second' }))).toBeNull()
    expect((await db.adapter.getWorkflowFile('wf-1', 'config/env.ts'))?.source).toBe('first')
  })

  it('deletes by path and reports whether anything was removed', async () => {
    await db.adapter.upsertWorkflowFile(row())
    expect(await db.adapter.deleteWorkflowFile('wf-2', 'config/env.ts')).toBe(false)
    expect(await db.adapter.deleteWorkflowFile('wf-1', 'config/env.ts', 'stale')).toBe(false)
    expect(await db.adapter.deleteWorkflowFile('wf-1', 'config/env.ts', 'h1')).toBe(true)
    expect(await db.adapter.deleteWorkflowFile('wf-1', 'config/env.ts')).toBe(false)
  })

  it('cascades with the workflow', async () => {
    await db.adapter.upsertWorkflowFile(row())
    db.sqlite.prepare(`DELETE FROM workflows WHERE id = 'wf-1'`).run()
    expect(await db.adapter.listWorkflowFiles('wf-1')).toEqual([])
  })
})
