import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import {
  type Harness,
  d1Harness,
  pgHarness,
  seed,
  seedDeployAccount,
  sqliteHarness,
} from './fixtures/workspaces-db.js'
import type { CreateRunData } from '../types.js'

// Two requests that start the same instance at once (a webhook retried, say)
// record it once: the second finds the run already there and writes nothing.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('one run per instance on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await seedDeployAccount(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  const runOn = (id: string, instanceId: string, workflowId = 'wf-enrich'): CreateRunData => ({
    id,
    workflowId,
    versionId: null,
    versionNumber: null,
    connectionId: 'c-seed',
    instanceId,
    status: 'queued',
  })

  it('records the first and refuses the second, writing nothing', async () => {
    const [first, second] = await Promise.all([
      h.adapter.createRunForInstance(runOn('r-a', 'order-42')),
      h.adapter.createRunForInstance(runOn('r-b', 'order-42')),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    const runs = (await h.adapter.listRunsByWorkflow('wf-enrich')).data
    expect(runs.filter((r) => r.instanceId === 'order-42')).toHaveLength(1)
  })

  it('takes the same instance id for another workflow', async () => {
    expect(await h.adapter.createRunForInstance(runOn('r-a', 'order-42'))).not.toBeNull()
    expect(await h.adapter.createRunForInstance(runOn('r-b', 'order-42', 'wf-sync'))).toMatchObject(
      { id: 'r-b', instanceId: 'order-42' },
    )
  })
})
