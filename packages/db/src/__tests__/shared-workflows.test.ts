import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq, sql } from 'drizzle-orm'
import {
  type Harness,
  T0,
  pgHarness,
  seed,
  seedDeployAccount,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Sharing a workflow to its project (B6), on both dialects. The seed's Project
// 101 has Sales (Lead enrichment v2 deployed, CRM sync, Webhook relay, Draft)
// and Ops; Ama owns Acme, Ben is its admin, Dee is a plain member with a
// grant on Ops only, so Sales is hidden from her.

const ACME = { projectId: 'p-101', organizationId: 'org-acme' }

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

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('shared workflows on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
    await seedDeployAccount(h)
  })

  describe('setWorkflowShared', () => {
    it('shares with the sharer’s name, and sharing again keeps the first sharer and time', async () => {
      const first = await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
      expect(first).toMatchObject({ sharedBy: 'u-ama', sharedByName: 'Ama Mensah', changed: true })
      expect(first!.sharedAt).not.toBeNull()

      const again = await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ben', true)
      expect(again).toEqual({ ...first, changed: false })
    })

    it('unshares, and unsharing again is a no-op', async () => {
      await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
      const off = { sharedBy: null, sharedAt: null, sharedByName: null }
      expect(await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', false)).toEqual({
        ...off,
        changed: true,
      })
      expect(await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', false)).toEqual({
        ...off,
        changed: false,
      })
    })

    it('changes nothing once the workflow has left the workspace the caller was judged on', async () => {
      await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', ['wf-enrich'])
      expect(await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)).toBeNull()
      await h.adapter.moveWorkflowToProject('wf-fn', 'p-202')
      expect(await h.adapter.setWorkflowShared('wf-fn', 'ws-sales', 'u-ama', true)).toBeNull()
      expect(await h.count('workflows', 'shared_at is not null')).toBe(0)
    })

    it('answers null for a workflow that is gone', async () => {
      expect(await h.adapter.setWorkflowShared('nope', 'ws-sales', 'u-ama', true)).toBeNull()
    })

    it('names nobody once the sharer has left the organization', async () => {
      await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-cleo', true)
      const listed = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        workspaceId: 'ws-sales',
      })
      const enrich = listed.data.find((w) => w.id === 'wf-enrich')!
      expect(enrich).toMatchObject({ sharedBy: 'u-cleo', sharedByName: null })
    })
  })

  describe('the workspace list and counts', () => {
    it('carries the share on each row and counts it on the workspace', async () => {
      await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
      await h.adapter.setWorkflowShared('wf-fn', 'ws-sales', 'u-ben', true)
      const listed = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        workspaceId: 'ws-sales',
      })
      const byId = new Map(listed.data.map((w) => [w.id, w]))
      expect(byId.get('wf-enrich')).toMatchObject({ sharedBy: 'u-ama', sharedByName: 'Ama Mensah' })
      expect(byId.get('wf-fn')).toMatchObject({ sharedBy: 'u-ben', sharedByName: 'Ben Okoro' })
      expect(byId.get('wf-sync')).toMatchObject({
        sharedBy: null,
        sharedAt: null,
        sharedByName: null,
      })

      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-101',
        workspace: 'sales',
      })
      expect(scope!.workspace!.counts.sharedOut).toBe(2)
      const workspaces = await h.adapter.listWorkspacesByProject('p-101', 'u-ama')
      expect(workspaces.map((w) => [w.slug, w.counts.sharedOut])).toEqual([
        ['sales', 2],
        ['ops', 0],
      ])
    })
  })

  describe('listSharedWorkflows', () => {
    beforeEach(async () => {
      await addDee(h)
      await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
      await h.adapter.setWorkflowShared('wf-fn', 'ws-sales', 'u-ama', true)
      await h.adapter.createWorkflow({
        id: 'wf-ops',
        projectId: 'p-101',
        workspaceId: 'ws-ops',
        createdBy: 'u-dee',
        name: 'Ops report',
      })
      await h.adapter.setWorkflowShared('wf-ops', 'ws-ops', 'u-dee', true)
      // Another project's share never shows in Project 101.
      await h.adapter.setWorkflowShared('wf-202', 'ws-202', 'u-ama', true)
    })

    it('lists the project’s shared items, newest share first, with where each comes from', async () => {
      const page = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-ama' })
      expect(page.data.map((r) => r.id).sort()).toEqual(['wf-enrich', 'wf-fn', 'wf-ops'])
      const enrich = page.data.find((r) => r.id === 'wf-enrich')!
      expect(enrich).toMatchObject({
        name: 'Lead enrichment',
        kind: 'workflow',
        deployedVersion: 2,
        sharedBy: 'u-ama',
        sharedByName: 'Ama Mensah',
        from: { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'blue' },
        viewerRole: 'admin',
      })
      const shared = page.data.map((r) => r.sharedAt)
      expect([...shared].sort().reverse()).toEqual(shared)
    })

    it('still names the deployed number once that version is deleted', async () => {
      await h.db
        .delete(h.schema.workflowVersions)
        .where(eq(h.schema.workflowVersions.id, 'v-enrich-2'))
      const page = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-ama' })
      expect(page.data.find((r) => r.id === 'wf-enrich')?.deployedVersion).toBe(2)
    })

    it('names a workspace hidden from the viewer, with no role there', async () => {
      const page = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-dee' })
      const roles = Object.fromEntries(page.data.map((r) => [r.id, [r.from.name, r.viewerRole]]))
      expect(roles).toEqual({
        'wf-enrich': ['Sales', null],
        'wf-fn': ['Sales', null],
        'wf-ops': ['Ops', 'editor'],
      })
    })

    it('leaves out one workspace’s own items, and filters by kind', async () => {
      const others = await h.adapter.listSharedWorkflows({
        ...ACME,
        viewer: 'u-dee',
        exceptWorkspaceId: 'ws-ops',
      })
      expect(others.data.map((r) => r.id).sort()).toEqual(['wf-enrich', 'wf-fn'])
      const functions = await h.adapter.listSharedWorkflows({
        ...ACME,
        viewer: 'u-ama',
        kind: 'script',
      })
      expect(functions.data.map((r) => r.id)).toEqual(['wf-fn'])
    })

    it('pages by share time with a cursor', async () => {
      const first = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-ama' }, { limit: 2 })
      expect(first.data).toHaveLength(2)
      expect(first.nextCursor).toBeTruthy()
      const second = await h.adapter.listSharedWorkflows(
        { ...ACME, viewer: 'u-ama' },
        { limit: 2, cursor: first.nextCursor! },
      )
      const ids = [...first.data, ...second.data].map((r) => r.id)
      expect(ids.sort()).toEqual(['wf-enrich', 'wf-fn', 'wf-ops'])
      expect(second.nextCursor).toBeFalsy()
    })

    it('breaks a tie on share time by id, so paging never skips or repeats a row', async () => {
      await h.db
        .update(h.schema.workflows)
        .set({ sharedAt: '2026-10-29T10:00:00.000Z' })
        .where(sql`${h.schema.workflows.sharedAt} is not null`)
      const seen: string[] = []
      let cursor: string | undefined
      do {
        const page = await h.adapter.listSharedWorkflows(
          { ...ACME, viewer: 'u-ama' },
          { limit: 1, cursor },
        )
        seen.push(...page.data.map((r) => r.id))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      expect(seen).toEqual(['wf-ops', 'wf-fn', 'wf-enrich'])
    })

    it('drops an unshared item', async () => {
      await h.adapter.setWorkflowShared('wf-fn', 'ws-sales', 'u-ama', false)
      const page = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-ama' })
      expect(page.data.map((r) => r.id).sort()).toEqual(['wf-enrich', 'wf-ops'])
    })
  })

  describe('moves', () => {
    beforeEach(async () => {
      await h.adapter.setWorkflowShared('wf-enrich', 'ws-sales', 'u-ama', true)
    })

    it('keeps the share when the workflow moves to another workspace in the project', async () => {
      expect(await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', ['wf-enrich'])).toEqual(
        [{ id: 'wf-enrich', name: 'Lead enrichment' }],
      )
      const page = await h.adapter.listSharedWorkflows({ ...ACME, viewer: 'u-ama' })
      expect(page.data.map((r) => [r.id, r.from.slug])).toEqual([['wf-enrich', 'ops']])
    })

    it('leaves the share behind when the workflow moves to another project', async () => {
      const moved = await h.adapter.moveWorkflowToProject('wf-enrich', 'p-202')
      expect(moved).toMatchObject({ projectId: 'p-202', sharedBy: null, sharedAt: null })
      const there = await h.adapter.listSharedWorkflows({
        projectId: 'p-202',
        organizationId: 'org-acme',
        viewer: 'u-ama',
      })
      expect(there.data).toEqual([])
    })
  })
})
