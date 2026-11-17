import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import {
  INTERRUPTED_DEPLOY_ERROR,
  INTERRUPTED_UPLOAD_ERROR,
  STALE_DEPLOY_MS,
} from '../deployment-status.js'
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// A deploy is recorded from its start, can be cancelled until it uploads, and
// settles with how it ended. Running and cancelled rows never count as live
// or as the workflow's newest deploy.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('deploy lifecycle on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }
  const FAR_PAST = '2000-01-01T00:00:00.000Z'

  async function start(id: string, workflowId = 'wf-enrich', versionId = 'v-enrich-2') {
    await h.adapter.startDeployment(
      {
        id,
        workflowId,
        versionId,
        versionNumber: Number(versionId.split('-').pop()),
        connectionId: 'c-a',
        configSnapshot: '{}',
        createdBy: 'u-ben',
      },
      FAR_PAST,
    )
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

  async function cancelOutcome(workflowId: string, id: string, userId: string | null) {
    return (await h.adapter.requestDeploymentCancel(workflowId, id, userId)).outcome
  }

  async function row(id: string) {
    const d = h.schema.deployments
    const rows = await h.db
      .select({
        status: d.status,
        error: d.error,
        serviceName: d.serviceName,
        serviceUrl: d.serviceUrl,
        cancelledBy: d.cancelledBy,
        startedAt: d.startedAt,
        createdAt: d.createdAt,
      })
      .from(d)
      .where(eq(d.id, id))
    return rows[0]
  }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await h.adapter.createConnection({
      id: 'c-a',
      organizationId: 'org-acme',
      createdBy: 'u-ama',
      provider: 'cloudflare',
      name: 'Account A',
      credentials: '{}',
    })
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  it('writes a running row when the deploy starts', async () => {
    await start('d-run')
    const r = await row('d-run')
    expect(r).toMatchObject({ status: 'deploying', serviceName: '', cancelledBy: null })
    expect(r?.startedAt).toBeTruthy()
    expect(await h.adapter.readDeploymentStatus('d-run')).toBe('deploying')
    expect(await h.adapter.readDeploymentStatus('d-none')).toBeNull()
  })

  it('cancels a deploy that has not started uploading, recording who asked', async () => {
    await start('d-run')
    expect(await cancelOutcome('wf-enrich', 'd-run', 'u-ama')).toBe('cancelling')
    expect(await row('d-run')).toMatchObject({ status: 'cancelling', cancelledBy: 'u-ama' })
    // Asking again changes nothing and keeps the first asker.
    expect(await cancelOutcome('wf-enrich', 'd-run', 'u-ben')).toBe('cancelling')
    expect(await row('d-run')).toMatchObject({ cancelledBy: 'u-ama' })
  })

  it('keeps the upload from starting once a cancel was asked for', async () => {
    await start('d-run')
    await cancelOutcome('wf-enrich', 'd-run', 'u-ama')
    expect(await h.adapter.markDeploymentUploading('d-run')).toBe(false)
    expect(await row('d-run')).toMatchObject({ status: 'cancelling' })
  })

  it('refuses a cancel once the upload started, leaving the row as it was', async () => {
    await start('d-run')
    expect(await h.adapter.markDeploymentUploading('d-run')).toBe(true)
    expect(await cancelOutcome('wf-enrich', 'd-run', 'u-ama')).toBe('uploading')
    expect(await row('d-run')).toMatchObject({ status: 'uploading', cancelledBy: null })
  })

  it('says a settled deploy is finished, and leaves it unchanged', async () => {
    await start('d-run')
    await h.adapter.settleDeployment('d-run', { status: 'failed', error: 'boom' })
    expect(await cancelOutcome('wf-enrich', 'd-run', 'u-ama')).toBe('finished')
    expect(await row('d-run')).toMatchObject({ status: 'failed', error: 'boom', cancelledBy: null })
  })

  it('finds no deploy of another workflow, nor one that does not exist', async () => {
    await start('d-run')
    expect(await cancelOutcome('wf-sync', 'd-run', 'u-ama')).toBe('not_found')
    expect(await cancelOutcome('wf-enrich', 'd-none', 'u-ama')).toBe('not_found')
    expect(await row('d-run')).toMatchObject({ status: 'deploying' })
  })

  it('settles with what the provider named it, at the moment it settled', async () => {
    await start('d-run')
    const before = (await row('d-run'))!
    await new Promise((resolve) => setTimeout(resolve, 5))
    await h.adapter.markDeploymentUploading('d-run')
    await h.adapter.settleDeployment('d-run', {
      status: 'success',
      serviceName: 'awaitstep-enrich',
      serviceUrl: 'https://enrich.example.workers.dev',
      deployedName: 'enrich',
    })
    const after = (await row('d-run'))!
    expect(after).toMatchObject({
      status: 'success',
      serviceName: 'awaitstep-enrich',
      serviceUrl: 'https://enrich.example.workers.dev',
      error: null,
    })
    expect(new Date(after.createdAt).getTime()).toBeGreaterThan(
      new Date(before.createdAt).getTime(),
    )
    expect(after.startedAt).toEqual(before.startedAt)
  })

  it('settles this workflow’s deploys left running past the cutoff as interrupted', async () => {
    const d = h.schema.deployments
    const base = {
      versionId: 'v-enrich-1',
      versionNumber: 1,
      connectionId: 'c-a',
      serviceName: '',
      createdAt: '2026-10-25T00:00:00.000Z',
    }
    await h.db.insert(d).values([
      {
        ...base,
        id: 'd-old',
        workflowId: 'wf-enrich',
        status: 'uploading',
        startedAt: '2026-10-25T00:00:00.000Z',
      },
      {
        ...base,
        id: 'd-recent',
        workflowId: 'wf-enrich',
        status: 'deploying',
        startedAt: '2026-10-29T00:00:00.000Z',
      },
      {
        ...base,
        id: 'd-other',
        workflowId: 'wf-sync',
        versionId: null,
        status: 'deploying',
        startedAt: '2026-10-25T00:00:00.000Z',
      },
      {
        ...base,
        id: 'd-done',
        workflowId: 'wf-enrich',
        status: 'success',
        startedAt: '2026-10-25T00:00:00.000Z',
      },
    ])
    await h.adapter.startDeployment(
      {
        id: 'd-new',
        workflowId: 'wf-enrich',
        versionId: 'v-enrich-2',
        versionNumber: 2,
        connectionId: 'c-a',
      },
      '2026-10-28T00:00:00.000Z',
    )
    // It was uploading: part of it may be live, so it never reads as a plain failure.
    expect(await row('d-old')).toMatchObject({ status: 'failed', error: INTERRUPTED_UPLOAD_ERROR })
    expect(await row('d-recent')).toMatchObject({ status: 'deploying', error: null })
    expect(await row('d-other')).toMatchObject({ status: 'deploying' })
    expect(await row('d-done')).toMatchObject({ status: 'success' })
    expect(await row('d-new')).toMatchObject({ status: 'deploying' })
  })

  it('never counts a running or cancelled deploy as live or as the newest deploy', async () => {
    // The seed's two deploys have no account; one live deploy on A, then a failed one.
    await h.db.delete(h.schema.deployments).where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
    // Apart by a few ms each: ordering reads the settle time, and ties break by id.
    await start('d-live', 'wf-enrich', 'v-enrich-1')
    await h.adapter.settleDeployment('d-live', { status: 'success', serviceName: 's' })
    await tick()
    await start('d-failed')
    await h.adapter.settleDeployment('d-failed', { status: 'failed', error: 'boom' })
    await tick()
    await start('d-cancelled')
    await cancelOutcome('wf-enrich', 'd-cancelled', 'u-ama')
    await h.adapter.settleDeployment('d-cancelled', { status: 'cancelled' })
    await tick()
    await start('d-running')

    const live = await h.adapter.listLiveDeployments('wf-enrich')
    expect(live.map((l) => l.deploymentId)).toEqual(['d-live'])

    const summary = await h.adapter.workflowPageSummary('wf-enrich', new Date())
    expect(summary?.latestDeploy).toMatchObject({ id: 'd-failed', status: 'failed' })

    // The history lists every attempt, newest first.
    const history = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
    expect(history.data.map((r) => [r.id, r.status])).toEqual([
      ['d-running', 'deploying'],
      ['d-cancelled', 'cancelled'],
      ['d-failed', 'failed'],
      ['d-live', 'success'],
    ])
  })

  it('reports the newest settled attempt as the status of a workflow live nowhere', async () => {
    await h.db.delete(h.schema.deployments).where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
    await start('d-failed')
    await h.adapter.settleDeployment('d-failed', { status: 'failed', error: 'boom' })
    await tick()
    await start('d-cancelled')
    await h.adapter.settleDeployment('d-cancelled', { status: 'cancelled' })
    await tick()
    await start('d-running')
    const { data } = await h.adapter.listWorkflowsWithStatus('p-101')
    expect(data.find((w) => w.id === 'wf-enrich')).toMatchObject({ deployStatus: 'failed' })
  })

  it('names the version and who cancelled, for the audit record and the history', async () => {
    await start('d-run')
    expect(await h.adapter.requestDeploymentCancel('wf-enrich', 'd-run', 'u-ama')).toEqual({
      outcome: 'cancelling',
      versionNumber: 2,
      asked: true,
    })
    // Asking again, even as the same person, is not the ask that stopped it.
    await tick()
    expect(await h.adapter.requestDeploymentCancel('wf-enrich', 'd-run', 'u-ama')).toMatchObject({
      outcome: 'cancelling',
      asked: false,
    })
    await h.adapter.settleDeployment('d-run', { status: 'cancelled' })
    const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
    const listed = data.find((d) => d.id === 'd-run')
    expect(listed?.cancelledByName).toBeTruthy()
    expect(data.find((d) => d.id !== 'd-run')?.cancelledByName ?? null).toBeNull()
  })

  it('treats a deploy left running past the window as interrupted, never stopping it', async () => {
    const d = h.schema.deployments
    const old = new Date(Date.now() - STALE_DEPLOY_MS - 60_000).toISOString()
    await h.db.insert(d).values({
      id: 'd-left',
      workflowId: 'wf-enrich',
      versionId: 'v-enrich-1',
      versionNumber: 1,
      connectionId: 'c-a',
      serviceName: '',
      status: 'deploying',
      startedAt: old,
      createdAt: old,
    })
    expect(await cancelOutcome('wf-enrich', 'd-left', 'u-ama')).toBe('interrupted')
    const project = await h.adapter.listRecentDeploymentsByProject('p-101')
    expect(project.data.find((r) => r.id === 'd-left')).toMatchObject({
      status: 'failed',
      error: INTERRUPTED_DEPLOY_ERROR,
    })
    expect(await row('d-left')).toMatchObject({ status: 'deploying', cancelledBy: null })
    const { data } = await h.adapter.listDeploymentsByWorkflow('wf-enrich')
    expect(data.find((r) => r.id === 'd-left')).toMatchObject({
      status: 'failed',
      error: INTERRUPTED_DEPLOY_ERROR,
    })
  })
})
