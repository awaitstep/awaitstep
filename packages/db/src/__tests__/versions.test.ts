import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { isUniqueViolation } from '../db-errors.js'
import { type Harness, T0, pgHarness, seed, sqliteHarness } from './fixtures/workspaces-db.js'

// The version writes a save relies on, on both dialects. The seed's CRM sync
// has one version (`v-sync-1`, `{}`), Lead enrichment two, Draft none.

const LATER = '2026-10-25T00:00:00.000Z'

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('versions adapter on %s', (_dialect, harness) => {
  let h: Harness

  beforeEach(async () => {
    h = await harness()
    await seed(h)
  })

  describe('getLatestVersion', () => {
    it('answers null for a workflow with no version', async () => {
      expect(await h.adapter.getLatestVersion('wf-draft')).toBeNull()
    })

    it('picks the highest version number even when an older row was saved more recently', async () => {
      await h.adapter.updateVersion('v-enrich-1', { createdAt: LATER })
      const listed = await h.adapter.listVersionsByWorkflow('wf-enrich')
      expect(listed.data[0]!.id).toBe('v-enrich-1')
      expect((await h.adapter.getLatestVersion('wf-enrich'))!.id).toBe('v-enrich-2')
    })
  })

  describe('updateLatestVersionIfIrMatches', () => {
    const latest = { id: 'v-sync-1', workflowId: 'wf-sync', version: 1 }
    const patch = { ir: '{"saved":true}', createdBy: 'u-ama', createdAt: LATER }

    it('saves over the row when its text is what was read, and returns the row as saved', async () => {
      const saved = await h.adapter.updateLatestVersionIfIrMatches(latest, '{}', patch)
      expect(saved).toMatchObject({ id: 'v-sync-1', ...patch })
      expect((await h.adapter.getWorkflowVersionById('v-sync-1'))!.ir).toBe('{"saved":true}')
    })

    it('changes nothing when the text moved since it was read', async () => {
      expect(
        await h.adapter.updateLatestVersionIfIrMatches(latest, '{"other":1}', patch),
      ).toBeNull()
      expect(await h.adapter.getWorkflowVersionById('v-sync-1')).toMatchObject({
        ir: '{}',
        createdAt: T0,
        createdBy: null,
      })
    })

    it('changes nothing once a newer version exists for the workflow', async () => {
      await h.adapter.createVersion({ id: 'v-sync-2', workflowId: 'wf-sync', version: 2, ir: '{}' })
      expect(await h.adapter.updateLatestVersionIfIrMatches(latest, '{}', patch)).toBeNull()
      expect((await h.adapter.getWorkflowVersionById('v-sync-1'))!.ir).toBe('{}')
    })

    it('ignores another workflow’s newer versions', async () => {
      // Lead enrichment is at version 2; CRM sync's version 1 is still its latest.
      const saved = await h.adapter.updateLatestVersionIfIrMatches(latest, '{}', patch)
      expect(saved?.ir).toBe('{"saved":true}')
    })
  })

  describe('advanceCurrentVersion', () => {
    const current = async (id: string) => (await h.adapter.getWorkflowById(id))!.currentVersionId

    it('points a workflow with no current version at the given one', async () => {
      await h.adapter.updateWorkflow('wf-sync', { currentVersionId: null })
      expect(await h.adapter.advanceCurrentVersion('wf-sync', { id: 'v-sync-1', version: 1 })).toBe(
        true,
      )
      expect(await current('wf-sync')).toBe('v-sync-1')
    })

    it('moves forward to a higher number and never back, nor onto the same one', async () => {
      await h.adapter.updateWorkflow('wf-sync', { currentVersionId: 'v-sync-1' })
      expect(await h.adapter.advanceCurrentVersion('wf-sync', { id: 'v-sync-1', version: 1 })).toBe(
        false,
      )
      await h.adapter.createVersion({ id: 'v-sync-2', workflowId: 'wf-sync', version: 2, ir: '{}' })
      expect(await h.adapter.advanceCurrentVersion('wf-sync', { id: 'v-sync-2', version: 2 })).toBe(
        true,
      )
      expect(await current('wf-sync')).toBe('v-sync-2')
      expect(await h.adapter.advanceCurrentVersion('wf-sync', { id: 'v-sync-1', version: 1 })).toBe(
        false,
      )
      expect(await current('wf-sync')).toBe('v-sync-2')
    })

    it('does not touch another workflow', async () => {
      await h.adapter.updateWorkflow('wf-enrich', { currentVersionId: 'v-enrich-2' })
      await h.adapter.updateWorkflow('wf-sync', { currentVersionId: null })
      await h.adapter.advanceCurrentVersion('wf-sync', { id: 'v-sync-1', version: 1 })
      expect(await current('wf-enrich')).toBe('v-enrich-2')
    })
  })

  describe('createVersion with an explicit number', () => {
    it('raises the unique violation a route reads as a lost race', async () => {
      const error = await h.adapter
        .createVersion({ id: 'v-sync-dup', workflowId: 'wf-sync', version: 1, ir: '{}' })
        .then(
          () => null,
          (err: unknown) => err,
        )
      expect(error).not.toBeNull()
      expect(isUniqueViolation(error)).toBe(true)
      expect(await h.adapter.getWorkflowVersionById('v-sync-dup')).toBeNull()
    })
  })
})
