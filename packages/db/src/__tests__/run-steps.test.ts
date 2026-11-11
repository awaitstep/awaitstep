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
    CREATE TABLE organization (id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL);
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, slug text NOT NULL);
    CREATE TABLE workspaces (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, slug text NOT NULL);
    INSERT INTO organization VALUES ('org-1', 'Acme', 'acme');
    INSERT INTO projects VALUES ('p-1', 'org-1', 'Project 101', 'project-101');
    INSERT INTO workspaces VALUES ('ws-1', 'p-1', 'Sales', 'sales');
    CREATE TABLE connections (id text PRIMARY KEY, organization_id text NOT NULL, created_by text, provider text NOT NULL, name text NOT NULL, credentials text NOT NULL, all_projects integer, token_status text NOT NULL DEFAULT 'unchecked', token_expires_at text, token_checked_at text, project_id text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workflows (id text PRIMARY KEY, project_id text NOT NULL, workspace_id text, name text NOT NULL, kind text NOT NULL DEFAULT 'workflow', description text, trigger_code text, current_version_id text, created_by text, created_at text NOT NULL, updated_at text NOT NULL, position integer, archived_at text, deleted_at text);
    CREATE TABLE workflow_runs (id text PRIMARY KEY, workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, version_id text, version_number integer, connection_id text, instance_id text NOT NULL, deployed_name text, trigger text, params text, content_type text, response_status integer, duration_ms integer, status text NOT NULL DEFAULT 'queued', output text, error text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE deployments (id text PRIMARY KEY, workflow_id text NOT NULL, version_id text, version_number integer, connection_id text, service_name text NOT NULL, service_url text, deployed_name text, status text NOT NULL, error text, created_at text NOT NULL, config_snapshot text);
    CREATE TABLE workflow_run_steps (
      id text PRIMARY KEY, run_id text NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      node_id text, step_name text NOT NULL, kind text NOT NULL, step_index integer NOT NULL DEFAULT 1,
      status text NOT NULL, attempt_count integer NOT NULL DEFAULT 1, error text,
      started_at text, ended_at text, output text, output_truncated integer NOT NULL DEFAULT 0, attempts text,
      created_at text NOT NULL, updated_at text NOT NULL
    );
    CREATE UNIQUE INDEX idx_workflow_run_steps_identity ON workflow_run_steps (run_id, step_name, kind, step_index);
  `)
  // Bound parameters per statement, to hold every write under D1's cap of 100.
  const params: number[] = []
  const adapter = new DrizzleDatabaseAdapter(
    drizzle(sqlite, { logger: { logQuery: (_query, bound) => params.push(bound.length) } }),
    sqliteSchema,
  )
  return { adapter, sqlite, params }
}

/** The sync loop's rows without their accounts. */
async function activeEntries(adapter: DrizzleDatabaseAdapter) {
  return (await adapter.listActiveRunsForSyncWithAccounts()).map((r) => r.entry)
}

function seedRun(sqlite: Database.Database, runId: string, status = 'running') {
  sqlite
    .prepare(
      `INSERT INTO workflows (id, project_id, workspace_id, name, created_at, updated_at) VALUES ('wf-1', 'p-1', 'ws-1', 'My Flow', ?, ?)
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

  it('takes the snapshot from the run’s own account, another one only once its deploy is gone', async () => {
    // The same version on two accounts, conn-2's deploy newer.
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, status, created_at, config_snapshot)
       VALUES ('d-own', 'wf-1', 'v-1', 'conn-1', 'svc', 'success', '2026-02-01T00:00:00Z', '{"own":true}'),
              ('d-other', 'wf-1', 'v-1', 'conn-2', 'svc', 'success', '2026-03-01T00:00:00Z', '{"other":true}')`,
    )
    await adapter.upsertRunSteps('run-1', [step()])
    expect((await adapter.listRunSteps('run-1', 'wf-1')).configSnapshot).toBe('{"own":true}')
    expect((await activeEntries(adapter))[0]!.configSnapshot).toBe('{"own":true}')
    // Taken down on conn-1: the row stays, and still says what the run ran.
    sqlite.exec(`UPDATE deployments SET status = 'taken_down' WHERE id = 'd-own'`)
    expect((await adapter.listRunSteps('run-1', 'wf-1')).configSnapshot).toBe('{"own":true}')
    // A takedown from before rows were kept left nothing on conn-1.
    sqlite.exec(`DELETE FROM deployments WHERE id = 'd-own'`)
    expect((await adapter.listRunSteps('run-1', 'wf-1')).configSnapshot).toBe('{"other":true}')
  })

  it('ignores a failed deploy of the run’s version for the snapshot', async () => {
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, status, created_at, config_snapshot)
       VALUES ('d-failed', 'wf-1', 'v-1', 'conn-1', 'svc', 'failed', '2026-02-01T00:00:00Z', '{"failed":true}')`,
    )
    await adapter.upsertRunSteps('run-1', [step()])
    expect((await adapter.listRunSteps('run-1', 'wf-1')).configSnapshot).toBeNull()
  })

  it('finds the snapshot by the kept number once the run’s version is deleted', async () => {
    // As the foreign keys leave them: both rows lost the id, both kept the number.
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, version_number, connection_id, service_name, status, created_at, config_snapshot)
       VALUES ('d-gone', 'wf-1', NULL, 3, 'conn-1', 'svc', 'success', '2026-02-01T00:00:00Z', '{"v3":true}'),
              ('d-other', 'wf-1', NULL, 4, 'conn-1', 'svc', 'success', '2026-03-01T00:00:00Z', '{"v4":true}')`,
    )
    sqlite.exec(`UPDATE workflow_runs SET version_id = NULL, version_number = 3 WHERE id = 'run-1'`)
    await adapter.upsertRunSteps('run-1', [step()])
    expect((await adapter.listRunSteps('run-1', 'wf-1')).configSnapshot).toBe('{"v3":true}')
    expect((await activeEntries(adapter))[0]!.configSnapshot).toBe('{"v3":true}')
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
    const active = await activeEntries(adapter)
    expect(active).toHaveLength(1)
    expect(active[0]!.run.id).toBe('run-1')
    expect(active[0]!.workflowName).toBe('My Flow')
    expect(active[0]!.place).toMatchObject({ organizationId: 'org-1', workspaceSlug: 'sales' })
    // Latest SUCCESSFUL deployment of the run's version wins.
    expect(active[0]!.configSnapshot).toBe('{"stepManifest":{"steps":[]}}')
  })

  it('names the run’s workflow as its deploy named it, never by the worker', async () => {
    seedRun(sqlite, 'run-1', 'running')
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, deployed_name, status, created_at)
       VALUES ('d-1', 'wf-1', 'v-1', 'conn-1', 'awaitstep-wf-1', 'My-Flow', 'success', '2026-02-01T00:00:00Z')`,
    )
    expect((await activeEntries(adapter))[0]!.deployedName).toBe('My-Flow')
    // A row from before the name was kept: none, so the workflow's own name stands in.
    sqlite.exec(`UPDATE deployments SET deployed_name = NULL`)
    expect((await activeEntries(adapter))[0]!.deployedName).toBeNull()
  })

  it('prefers the name the run itself was started under', async () => {
    seedRun(sqlite, 'run-1', 'running')
    sqlite.exec(
      `INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, deployed_name, status, created_at)
       VALUES ('d-1', 'wf-1', 'v-1', 'conn-1', 'awaitstep-wf-1', 'Renamed-and-redeployed', 'success', '2026-02-01T00:00:00Z')`,
    )
    sqlite.exec(`UPDATE workflow_runs SET deployed_name = 'Started-under' WHERE id = 'run-1'`)
    expect((await activeEntries(adapter))[0]!.deployedName).toBe('Started-under')
  })

  it('excludes terminal runs', async () => {
    seedRun(sqlite, 'run-1', 'complete')
    seedRun(sqlite, 'run-2', 'errored')
    seedRun(sqlite, 'run-3', 'waiting')
    const active = await activeEntries(adapter)
    expect(active.map((a) => a.run.id)).toEqual(['run-3'])
  })

  it('yields a null snapshot when the run version was never successfully deployed', async () => {
    seedRun(sqlite, 'run-1', 'running')
    const active = await activeEntries(adapter)
    expect(active[0]!.configSnapshot).toBeNull()
  })
})

describe('getRunForSync', () => {
  it('returns one run with the same joined context, scoped to its workflow', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'run-1', 'complete')
    sqlite
      .prepare(
        `INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, deployed_name, status, created_at)
         VALUES ('d-1', 'wf-1', 'v-1', 'conn-1', 'awaitstep-wf-1', 'my-deployed-flow', 'success', ?)`,
      )
      .run(now)
    const entry = await adapter
      .getRunForSyncWithAccount('run-1', 'wf-1', 'org-1')
      .then((r) => r?.entry ?? null)
    expect(entry?.run.id).toBe('run-1')
    expect(entry?.workflowName).toBe('My Flow')
    expect(entry?.deployedName).toBe('my-deployed-flow')
    expect(entry?.place).toEqual({
      organizationId: 'org-1',
      orgSlug: 'acme',
      projectId: 'p-1',
      projectSlug: 'project-101',
      projectName: 'Project 101',
      workspaceId: 'ws-1',
      workspaceSlug: 'sales',
      workspaceName: 'Sales',
    })
    expect(
      await adapter
        .getRunForSyncWithAccount('run-1', 'other-wf', 'org-1')
        .then((r) => r?.entry ?? null),
    ).toBeNull()
  })
})

describe('updateRunFromStatus', () => {
  it('moves the run only from the status it was read in, and says whether it did', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'run-1', 'running')
    expect(
      await adapter.updateRunFromStatus('run-1', 'running', { status: 'errored', error: '"boom"' }),
    ).toBe(true)
    // A second sync that read it as running is beaten: nothing changes.
    expect(
      await adapter.updateRunFromStatus('run-1', 'running', { status: 'complete', output: '1' }),
    ).toBe(false)
    const row = sqlite
      .prepare('SELECT status, error, output FROM workflow_runs WHERE id = ?')
      .get('run-1')
    expect(row).toEqual({ status: 'errored', error: '"boom"', output: null })
  })
})

describe('many steps (D1 binds at most 100 parameters per statement)', () => {
  it('upserts 40 steps in statements of at most 100 parameters', async () => {
    const db = createTestDb()
    seedRun(db.sqlite, 'r-many')
    db.params.length = 0
    await db.adapter.upsertRunSteps(
      'r-many',
      Array.from({ length: 40 }, (_, i) => ({
        id: `s-${i}`,
        stepName: `step ${i}`,
        kind: 'do',
        stepIndex: 1,
        status: 'complete',
        attemptCount: 1,
      })),
    )
    expect(Math.max(...db.params)).toBeLessThanOrEqual(100)
    expect(
      (
        db.sqlite
          .prepare("SELECT count(*) AS n FROM workflow_run_steps WHERE run_id = 'r-many'")
          .get() as {
          n: number
        }
      ).n,
    ).toBe(40)
  })
})

describe('a step’s output and tries', () => {
  it('stays out of the list and is read one step at a time, only through its workflow', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'run-1')
    await adapter.upsertRunSteps('run-1', [
      step({
        id: 'rs-1',
        status: 'complete',
        output: '{"sent":3}',
        attempts: '[{"start":"a","end":"b"}]',
      }),
    ])
    const { steps } = await adapter.listRunSteps('run-1', 'wf-1')
    expect(steps[0]).not.toHaveProperty('output')
    expect(await adapter.getRunStepExtras('rs-1', 'run-1', 'wf-1')).toEqual({
      output: '{"sent":3}',
      outputTruncated: false,
      attempts: '[{"start":"a","end":"b"}]',
    })
    expect(await adapter.getRunStepExtras('rs-1', 'run-1', 'wf-other')).toBeNull()

    // A later sync that cut the output says so.
    await adapter.upsertRunSteps('run-1', [
      step({ id: 'rs-x', status: 'complete', output: '{"se', outputTruncated: true }),
    ])
    expect((await adapter.getRunStepExtras('rs-1', 'run-1', 'wf-1'))!.outputTruncated).toBe(true)
  })
})

describe('a run’s trigger and payload', () => {
  it('keeps them, flags the payload on the run, and reads it only for its workflow and account', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'seed')
    const run = await adapter.createRun({
      id: 'run-2',
      workflowId: 'wf-1',
      versionId: null,
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-2',
      trigger: 'api',
      params: '{"n":1}',
      status: 'queued',
    })
    expect(run.params).toBe('{"n":1}')
    expect(await adapter.getRunDetail('run-2', 'wf-1')).toMatchObject({
      trigger: 'api',
      hasParams: true,
    })
    expect(await adapter.getRunDetail('seed', 'wf-1')).toMatchObject({
      trigger: null,
      hasParams: false,
    })
    expect(await adapter.getRunParams('run-2', 'wf-1')).toEqual({
      params: '{"n":1}',
      contentType: null,
    })
    expect(await adapter.getRunParams('run-2', 'wf-1', 'conn-1')).toEqual({
      params: '{"n":1}',
      contentType: null,
    })
    expect(await adapter.getRunParams('run-2', 'wf-1', 'conn-other')).toBeNull()
    expect(await adapter.getRunParams('run-2', 'wf-other')).toBeNull()
  })

  it('keeps a call’s body type, so it is sent again the same way', async () => {
    const { adapter, sqlite } = createTestDb()
    seedRun(sqlite, 'seed')
    await adapter.createRun({
      id: 'call-1',
      workflowId: 'wf-1',
      versionId: null,
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'call_1',
      trigger: 'api',
      params: '"a=1"',
      contentType: 'application/x-www-form-urlencoded',
      status: 'complete',
    })
    expect(await adapter.getRunParams('call-1', 'wf-1', 'conn-1')).toEqual({
      params: '"a=1"',
      contentType: 'application/x-www-form-urlencoded',
    })
  })
})
