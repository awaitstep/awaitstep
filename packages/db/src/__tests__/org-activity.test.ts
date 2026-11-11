import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import { type Harness, T0, pgHarness, seed, sqliteHarness } from './fixtures/workspaces-db.js'

// The org home's Recent activity, on both dialects. The seed's Acme has Lead
// enrichment (v1 and v2 deployed, one errored run), CRM sync (a failed deploy,
// one errored run) in Project 101's Sales, and Nightly (a terminated run) in
// Project 202. Ama owns Acme; Dee is a plain member with a grant on Ops only.

async function addDee(h: Harness) {
  const s = h.schema
  await h.db.insert(s.user).values({
    id: 'u-dee',
    name: 'Dee Lane',
    email: 'dee@acme.test',
    emailVerified: true,
    createdAt: T0,
    updatedAt: T0,
  })
  await h.db.insert(s.member).values({
    id: 'm-5',
    userId: 'u-dee',
    organizationId: 'org-acme',
    role: 'member',
    createdAt: T0,
  })
  await h.db
    .insert(s.workspaceMembers)
    .values({ id: 'wm-dee', workspaceId: 'ws-ops', userId: 'u-dee', role: 'editor', createdAt: T0 })
}

function run(id: string, workflowId: string, status: string, createdAt: string) {
  return {
    id,
    workflowId,
    versionId: null,
    connectionId: null,
    instanceId: id,
    status,
    createdAt,
    updatedAt: createdAt,
  }
}

async function activity(h: Harness, organizationId: string, viewerId: string) {
  const summary = await h.adapter.orgHomeSummary(organizationId, viewerId)
  return summary!.activity
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('org home activity on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
  })

  it('lists deploys and each workflow’s latest failure, newest first, with only what the row shows', async () => {
    const rows = await activity(h, 'org-acme', 'u-ama')
    expect(rows.map((r) => r.id)).toEqual([
      'failed:r-7',
      'failed:r-5',
      'failed:r-2',
      'deployed:d-2',
      'deployed:d-1',
    ])
    expect(rows[3]).toEqual({
      id: 'deployed:d-2',
      kind: 'deployed',
      workflow: { name: 'Lead enrichment', kind: 'workflow' },
      version: 2,
      project: { slug: 'project-101', name: 'Project 101' },
      workspace: { slug: 'sales', name: 'Sales', colour: 'blue' },
      at: '2026-10-22T00:00:00.000Z',
    })
    expect(rows[0]).toMatchObject({
      kind: 'failed',
      workflow: { name: 'Nightly' },
      version: null,
      project: { slug: 'project-202' },
      at: '2026-10-28T08:00:00.000Z',
    })
  })

  it('keeps one row for a workflow that fails again and again: its latest failure', async () => {
    await h.db
      .insert(h.schema.workflowRuns)
      .values([
        run('r-8', 'wf-enrich', 'errored', '2026-10-28T09:00:00.000Z'),
        run('r-9', 'wf-enrich', 'terminated', '2026-10-28T10:00:00.000Z'),
      ])
    const rows = await activity(h, 'org-acme', 'u-ama')
    const enrichFailures = rows.filter(
      (r) => r.kind === 'failed' && r.workflow.name === 'Lead enrichment',
    )
    expect(enrichFailures.map((r) => r.id)).toEqual(['failed:r-9'])
  })

  it('leaves out failed and taken-down deploys', async () => {
    await h.db
      .update(h.schema.deployments)
      .set({ status: 'taken_down' })
      .where(eq(h.schema.deployments.id, 'd-1'))
    const ids = (await activity(h, 'org-acme', 'u-ama')).map((r) => r.id)
    expect(ids).not.toContain('deployed:d-1')
    expect(ids).not.toContain('deployed:d-3')
  })

  it('adds a share to the project, and never shows more than five rows', async () => {
    await h.adapter.setWorkflowShared('wf-sync', 'ws-sales', 'u-ama', true)
    const rows = await activity(h, 'org-acme', 'u-ama')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({
      id: 'shared:wf-sync',
      kind: 'shared',
      workflow: { name: 'CRM sync', kind: 'workflow' },
      version: null,
    })
    // The oldest event makes room.
    expect(rows.map((r) => r.id)).not.toContain('deployed:d-1')
  })

  it('shows only the workspaces the viewer can open', async () => {
    await addDee(h)
    expect(await activity(h, 'org-acme', 'u-dee')).toEqual([])

    await h.db.insert(h.schema.workflows).values({
      id: 'wf-ops',
      projectId: 'p-101',
      workspaceId: 'ws-ops',
      createdBy: 'u-ben',
      name: 'Pager',
      kind: 'workflow',
      createdAt: T0,
      updatedAt: T0,
    })
    await h.db
      .insert(h.schema.workflowRuns)
      .values(run('r-ops', 'wf-ops', 'errored', '2026-10-28T11:00:00.000Z'))
    const rows = await activity(h, 'org-acme', 'u-dee')
    expect(rows.map((r) => r.id)).toEqual(['failed:r-ops'])
    expect(rows[0]!.workspace).toEqual({ slug: 'ops', name: 'Ops', colour: 'amber' })
  })

  it('judges a row by its workspace’s project, even when the workflow row names another', async () => {
    await addDee(h)
    // A grant on Project 202 only; Sales is Project 101's.
    await h.db
      .insert(h.schema.projectMembers)
      .values({ projectId: 'p-202', userId: 'u-dee', role: 'member', createdAt: T0 })
    // A workflow in Sales whose own project id points at Project 202 (a half-finished move).
    await h.db.insert(h.schema.workflows).values({
      id: 'wf-stray',
      projectId: 'p-202',
      workspaceId: 'ws-sales',
      createdBy: 'u-ama',
      name: 'Stray',
      kind: 'workflow',
      createdAt: T0,
      updatedAt: T0,
    })
    await h.db
      .insert(h.schema.workflowRuns)
      .values(run('r-stray', 'wf-stray', 'errored', '2026-10-28T11:00:00.000Z'))
    const ids = (await activity(h, 'org-acme', 'u-dee')).map((r) => r.id)
    expect(ids).not.toContain('failed:r-stray')
    const summary = await h.adapter.orgHomeSummary('org-acme', 'u-dee')
    expect(summary!.failing.first?.workflow.name).not.toBe('Stray')
    // Ama sees it under the workspace's own project.
    const ama = await activity(h, 'org-acme', 'u-ama')
    expect(ama.find((r) => r.id === 'failed:r-stray')?.project.slug).toBe('project-101')
  })

  it('never shows another organization’s activity', async () => {
    await h.db
      .insert(h.schema.workflowRuns)
      .values(run('r-g', 'wf-g', 'errored', '2026-10-28T11:30:00.000Z'))
    expect((await activity(h, 'org-acme', 'u-ama')).map((r) => r.id)).not.toContain('failed:r-g')
    expect((await activity(h, 'org-globex', 'u-cleo')).map((r) => r.id)).toEqual(['failed:r-g'])
  })
})
