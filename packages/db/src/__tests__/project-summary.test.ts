import { beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { type Harness, pgHarness, seed, sqliteHarness } from './fixtures/workspaces-db.js'

// The workspaces page's Project-wide cards. Its counts are correlated
// subqueries in a statement with no join, where drizzle leaves a column bare
// unless the field is nested (`fieldOf`): a bare `project_id = id` once read
// the subquery's own row and counted 0 next to a listed item.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('projectSummary on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
  })

  async function summary() {
    return (await h.adapter.projectSummary('org-acme', 'p-101', new Date().toISOString()))!
  }

  it('counts the shared items it lists', async () => {
    await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
    const { shared } = await summary()
    expect(shared.count).toBe(1)
    expect(shared.first.map((item) => item.id)).toEqual(['wf-enrich'])
  })

  it('counts the project’s own variables', async () => {
    await h.adapter.createEnvVar({
      id: 'v-1',
      place: { level: 'project', organizationId: 'org-acme', projectId: 'p-101' },
      createdBy: 'u-ama',
      name: 'API_URL',
      value: 'https://101.test',
      isSecret: false,
    })
    const { variables } = await summary()
    expect(variables).toMatchObject({ total: 1, own: 1, inherited: 0, first: ['API_URL'] })
  })

  it('counts the admins it shows', async () => {
    const { admins } = await summary()
    expect(admins.count).toBe(admins.people.length)
  })
})
