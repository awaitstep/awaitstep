import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import type { UpsertRunStepData } from '../types.js'

const now = '2026-10-08T00:00:00.000Z'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE workflows (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, kind text NOT NULL DEFAULT 'workflow', description text, trigger_code text, current_version_id text, created_by text, created_at text NOT NULL, updated_at text NOT NULL, position integer, archived_at text, deleted_at text);
    CREATE TABLE workflow_runs (id text PRIMARY KEY, workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, version_id text, connection_id text, instance_id text NOT NULL, status text NOT NULL DEFAULT 'queued', output text, error text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE deployments (id text PRIMARY KEY, workflow_id text NOT NULL, version_id text NOT NULL, connection_id text, service_name text NOT NULL, service_url text, status text NOT NULL, error text, created_at text NOT NULL, config_snapshot text);
    CREATE TABLE workflow_run_steps (
      id text PRIMARY KEY, run_id text NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      node_id text, step_name text NOT NULL, kind text NOT NULL, step_index integer NOT NULL DEFAULT 1,
      status text NOT NULL, attempt_count integer NOT NULL DEFAULT 1, error text,
      started_at text, ended_at text, created_at text NOT NULL, updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX idx_workflow_run_steps_identity ON workflow_run_steps (run_id, step_name, kind, step_index);
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function seedRun(sqlite: Database.Database, runId: string, status = 'running') {
  sqlite
    .prepare(
      `INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-1', 'p-1', 'My Flow', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(now, now)
  sqlite
    .prepare(
      `INSERT INTO workflow_runs (id, workflow_id, version_id, connection_id, instance_id, status, created_at, updated_at)
       VALUES (?, 'wf-1', 'v-1', 'conn-1', ?, ?, ?, ?)`,
    )
    .run(runId, `inst-${runId}`, status, now, now)
}

function step(overrides: Partial<UpsertRunStepData> = {}): UpsertRunStepData {
  return {
    id: `rs-${Math.random().toString(36).slice(2)}`,
    nodeId: 'node-1',
    stepName: 'node-1',
    kind: 'do',
    stepIndex: 1,
    status: 'running',
    attemptCount: 1,
    startedAt: now,
    ...overrides,
  }
}

describe('RunStepsAdapter', () => {
  let adapter: DrizzleDatabaseAdapter
  let sqlite: Database.Database

  beforeEach(() => {
    ;({ adapter, sqlite } = createTestDb())
    seedRun(sqlite, 'run-1')
  })

  it('inserts steps and reads them back scoped to the owning workflow', async () => {
    await adapter.upsertRunSteps('run-1', [step(), step({ stepName: 'node-2', nodeId: 'node-2' })])
    const { steps } = await adapter.listRunSteps('run-1', 'wf-1')
    expect(steps).toHaveLength(2)
    expect(steps.map((s) => s.stepName).sort()).toEqual(['node-1', 'node-2'])
  })

  it('returns nothing for a run queried under the wrong workflow', async () => {
    await adapter.upsertRunSteps('run-1', [step()])
    expect((await adapter.listRunSteps('run-1', 'other-wf')).steps).toEqual([])
  })

  it('converges on re-sync: same identity updates in place instead of duplicating', async () => {
    await adapter.upsertRunSteps('run-1', [step({ status: 'running', attemptCount: 1 })])
    await adapter.upsertRunSteps('run-1', [
      step({ status: 'complete', attemptCount: 3, endedAt: now }),
    ])
    const { steps } = await adapter.listRunSteps('run-1', 'wf-1')
    expect(steps).toHaveLength(1)
    expect(steps[0]!.status).toBe('complete')
    expect(steps[0]!.attemptCount).toBe(3)
    expect(steps[0]!.endedAt).toBe(now)
  })

  it('keeps loop iterations distinct via stepIndex', async () => {
    await adapter.upsertRunSteps('run-1', [
      step({ stepIndex: 1, status: 'complete' }),
      step({ stepIndex: 2, status: 'running' }),
    ])
    const { steps } = await adapter.listRunSteps('run-1', 'wf-1')
    expect(steps).toHaveLength(2)
  })

  it('carries the deployed version snapshot alongside the steps', async () => {
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, service_name, status, created_at, config_snapshot)
       VALUES ('d-1', 'wf-1', 'v-1', 'svc', 'success', '2026-02-01T00:00:00Z', '{"stepManifest":{"steps":[]}}')`,
    )
    await adapter.upsertRunSteps('run-1', [step()])
    const result = await adapter.listRunSteps('run-1', 'wf-1')
    expect(result.configSnapshot).toBe('{"stepManifest":{"steps":[]}}')
  })

  it('yields a null snapshot and no rows for a run with no steps yet', async () => {
    const result = await adapter.listRunSteps('run-1', 'wf-1')
    expect(result).toEqual({ steps: [], configSnapshot: null })
  })
})

describe('listActiveRunsForSync', () => {
  let adapter: DrizzleDatabaseAdapter
  let sqlite: Database.Database

  beforeEach(() => {
    ;({ adapter, sqlite } = createTestDb())
  })

  it('returns non-terminal runs with workflow name and the deployed version snapshot', async () => {
    seedRun(sqlite, 'run-1', 'running')
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, service_name, status, created_at, config_snapshot)
       VALUES ('d-old', 'wf-1', 'v-1', 'svc', 'success', '2026-01-01T00:00:00Z', '{"old":true}'),
              ('d-new', 'wf-1', 'v-1', 'svc', 'success', '2026-02-01T00:00:00Z', '{"stepManifest":{"steps":[]}}'),
              ('d-fail', 'wf-1', 'v-1', 'svc', 'failed', '2026-03-01T00:00:00Z', '{"failed":true}')`,
    )
    const active = await adapter.listActiveRunsForSync()
    expect(active).toHaveLength(1)
    expect(active[0]!.run.id).toBe('run-1')
    expect(active[0]!.workflowName).toBe('My Flow')
    // Latest SUCCESSFUL deployment of the run's version wins.
    expect(active[0]!.configSnapshot).toBe('{"stepManifest":{"steps":[]}}')
  })

  it('excludes terminal runs', async () => {
    seedRun(sqlite, 'run-1', 'complete')
    seedRun(sqlite, 'run-2', 'errored')
    seedRun(sqlite, 'run-3', 'waiting')
    const active = await adapter.listActiveRunsForSync()
    expect(active.map((a) => a.run.id)).toEqual(['run-3'])
  })

  it('yields a null snapshot when the run version was never successfully deployed', async () => {
    seedRun(sqlite, 'run-1', 'running')
    const active = await adapter.listActiveRunsForSync()
    expect(active[0]!.configSnapshot).toBeNull()
  })
})

describe('getRunForSync', () => {
  it('returns one run with the same joined context, scoped to its workflow', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'run-1', 'complete')
    const entry = await adapter.getRunForSync('run-1', 'wf-1')
    expect(entry?.run.id).toBe('run-1')
    expect(entry?.workflowName).toBe('My Flow')
    expect(await adapter.getRunForSync('run-1', 'other-wf')).toBeNull()
  })
})
