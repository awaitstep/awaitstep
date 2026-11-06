import { describe, it, expect, beforeEach, vi } from 'vitest'
import { contentHash } from '@awaitstep/codegen'
import {
  createTestApp,
  recordedAuditEvents,
  resetStore,
  TEST_USER_ID,
  TEST_PROJECT_ID,
  mockDb,
} from './helpers.js'
import { graphHash } from '../lib/graph-hash.js'

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

const modifiedIR = {
  ...validIR,
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Modified',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 2;' },
    },
  ],
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

describe('version routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  describe('POST /api/workflows/:workflowId/versions', () => {
    it('creates a version with IR only', async () => {
      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.version).toBe(1)
      expect(body.workflowId).toBe('wf-1')
      expect(body.ir).toBeDefined()
    })

    it('refuses a first save that seeds a generated project path', async () => {
      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ir: {
            ...validIR,
            runtime: { files: [{ path: 'awaitstep/util.ts', source: 'export const x = 1' }] },
          },
        }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { details: { path: string; message: string }[] }
      expect(body.details).toContainEqual(expect.objectContaining({ path: 'awaitstep/util.ts' }))
    })

    it('returns existing version when IR has not changed', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(1)
    })

    it('overwrites undeployed version when IR changes', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const res = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: modifiedIR }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(1)
    })

    it('updates workflow currentVersionId', async () => {
      await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })

      const wf = await mockDb.getWorkflowById('wf-1')
      expect(wf?.currentVersionId).toBeTruthy()
    })

    it('returns 404 for another projects workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-other',
        projectId: 'other-project',
        createdBy: 'other-user',
        name: 'Secret',
      })

      const res = await app.request(url('/api/workflows/wf-other/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('who saved a version', () => {
    it('stamps the saver on a new version, and the new saver on one saved over', async () => {
      const first = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: validIR }),
      })
      const created = await first.json()
      expect(created.createdBy).toBe(TEST_USER_ID)
      // Undeployed, so the next save overwrites it in place: still stamped, and dated now.
      await mockDb.updateVersion(created.id, {
        createdBy: 'someone-else',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      const second = await app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: modifiedIR }),
      })
      const saved = await second.json()
      expect(saved.createdBy).toBe(TEST_USER_ID)
      expect(saved.createdAt > '2026-01-01T00:00:00.000Z').toBe(true)
    })
  })

  describe('GET /api/workflows/:workflowId/versions', () => {
    it('lists versions for a workflow', async () => {
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', version: 1, ir: '{}' })
      await mockDb.createVersion({ id: 'v-2', workflowId: 'wf-1', version: 2, ir: '{}' })

      const res = await app.request(url('/api/workflows/wf-1/versions'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(2)
    })
  })

  describe('GET /api/workflows/:workflowId/versions/:versionId', () => {
    it('returns a specific version', async () => {
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-1', version: 1, ir: '{"test":true}' })

      const res = await app.request(url('/api/workflows/wf-1/versions/v-1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ir).toBe('{"test":true}')
    })

    it('returns 404 for version from different workflow', async () => {
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Other',
      })
      await mockDb.createVersion({ id: 'v-1', workflowId: 'wf-2', version: 1, ir: '{}' })

      const res = await app.request(url('/api/workflows/wf-1/versions/v-1'))
      expect(res.status).toBe(404)
    })
  })

  describe('the audit log (B7)', () => {
    it('records a revert and a version deletion with the version number', async () => {
      const v1 = await mockDb.createVersion({
        id: 'v-1',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      const v2 = await mockDb.createVersion({
        id: 'v-2',
        workflowId: 'wf-1',
        ir: JSON.stringify(modifiedIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: v2.id })

      const reverted = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}/revert`), {
        method: 'POST',
      })
      expect(reverted.status).toBe(201)
      // The new version a revert makes is the reverter's.
      expect((await reverted.json()).createdBy).toBe(TEST_USER_ID)
      const deleted = await app.request(url(`/api/workflows/wf-1/versions/${v2.id}`), {
        method: 'DELETE',
      })
      expect(deleted.status).toBe(200)

      expect(
        recordedAuditEvents().map((e) => [e.event, e.kind, e.target, e.detail, e.level]),
      ).toEqual([
        ['version.revert', 'deploy', 'Test', `To v${v1.version} · Dashboard`, 'workspace'],
        ['version.delete', 'danger', `Test v${v2.version}`, 'Dashboard', 'workspace'],
      ])
    })

    it('records nothing for a refused deletion', async () => {
      const v1 = await mockDb.createVersion({
        id: 'v-1',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: v1.id })
      const res = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}`), {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
      expect(recordedAuditEvents()).toEqual([])
    })
  })

  describe('the save precondition (baseGraphHash)', () => {
    const post = (body: unknown) =>
      app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    const stored = async (id: string) => (await mockDb.getWorkflowVersionById(id))!.ir

    it('answers every save with the graph hash of what is stored, which /full and /project repeat', async () => {
      const res = await post({ ir: validIR })
      const created = await res.json()
      expect(created.graphHash).toBe(graphHash(await stored(created.id)))
      const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
      expect(full.version.id).toBe(created.id)
      expect(full.graphHash).toBe(created.graphHash)
      const listing = await (await app.request(url('/api/workflows/wf-1/project'))).json()
      expect(listing.version).toEqual({ id: created.id, graphHash: created.graphHash })
    })

    it('reports no hash while the workflow has no version, and refuses a save that names one', async () => {
      const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
      expect(full).toMatchObject({ version: null, graphHash: null })
      const listing = await (await app.request(url('/api/workflows/wf-1/project'))).json()
      expect(listing.version).toBeNull()

      const res = await post({ ir: validIR, baseGraphHash: 'deadbeefdeadbeef' })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'This workflow changed since it was loaded',
        currentVersionId: null,
        currentGraphHash: null,
      })
      expect((await mockDb.listVersionsByWorkflow('wf-1')).data).toEqual([])
    })

    it('saves over the draft when the base is the latest graph, and moves the hash', async () => {
      const created = await (await post({ ir: validIR })).json()
      const res = await post({ ir: modifiedIR, baseGraphHash: created.graphHash })
      expect(res.status).toBe(200)
      const saved = await res.json()
      expect(saved.id).toBe(created.id)
      expect(saved.graphHash).not.toBe(created.graphHash)
      expect(saved.graphHash).toBe(graphHash(await stored(created.id)))
    })

    it('refuses a stale base with the current version and hash, leaving the row byte-identical', async () => {
      const created = await (await post({ ir: validIR })).json()
      const before = await stored(created.id)
      const res = await post({ ir: modifiedIR, baseGraphHash: 'deadbeefdeadbeef' })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'This workflow changed since it was loaded',
        currentVersionId: created.id,
        currentGraphHash: created.graphHash,
      })
      expect(await stored(created.id)).toBe(before)
      expect((await mockDb.listVersionsByWorkflow('wf-1')).data).toHaveLength(1)
    })

    it('lets an unchanged IR through on a stale base: a retried save must not 409 on its own result', async () => {
      const created = await (await post({ ir: validIR })).json()
      const res = await post({ ir: validIR, baseGraphHash: 'deadbeefdeadbeef' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: created.id, graphHash: created.graphHash })
    })

    it('writes nothing on a 409, not even the files the IR would seed', async () => {
      const created = await (await post({ ir: validIR })).json()
      // A canvas tab still holding the legacy dependencies setting after Code
      // removed package.json: a stale save used to bring the file back.
      const withDeps = { ...modifiedIR, runtime: { dependencies: { zod: '^4.0.0' } } }
      const stale = await post({ ir: withDeps, baseGraphHash: 'deadbeefdeadbeef' })
      expect(stale.status).toBe(409)
      expect(await mockDb.listWorkflowFiles('wf-1')).toEqual([])

      const current = await post({ ir: withDeps, baseGraphHash: created.graphHash })
      expect(current.status).toBe(200)
      expect((await mockDb.listWorkflowFiles('wf-1')).map((f) => f.path)).toEqual(['package.json'])
      expect(JSON.parse(await stored(created.id)).runtime?.dependencies).toBeUndefined()
    })

    it('writes no seeds either when the write loses a race and the retry answers 409', async () => {
      const created = await (await post({ ir: validIR })).json()
      const moved = { ...validIR, nodes: [{ ...validIR.nodes[0]!, name: 'Moved' }] }
      const spy = vi
        .spyOn(mockDb, 'updateLatestVersionIfIrMatches')
        .mockImplementationOnce(async (latest) => {
          await mockDb.updateVersion(latest.id, { ir: JSON.stringify(moved) })
          return null
        })
      try {
        const withDeps = { ...modifiedIR, runtime: { dependencies: { zod: '^4.0.0' } } }
        const res = await post({ ir: withDeps, baseGraphHash: created.graphHash })
        expect(res.status).toBe(409)
        expect(await mockDb.listWorkflowFiles('wf-1')).toEqual([])
      } finally {
        spy.mockRestore()
      }
    })

    it('never seeds over a file another writer created between the read and the write', async () => {
      const created = await (await post({ ir: validIR })).json()
      const real = mockDb.updateLatestVersionIfIrMatches
      const spy = vi
        .spyOn(mockDb, 'updateLatestVersionIfIrMatches')
        .mockImplementationOnce(async (latest, expectedIr, patch) => {
          await mockDb.upsertWorkflowFile({
            id: 'theirs',
            workflowId: 'wf-1',
            path: 'package.json',
            source: '{"dependencies":{"theirs":"1.0.0"}}',
            hash: 'h-theirs',
            size: 36,
          })
          return real.call(mockDb, latest, expectedIr, patch)
        })
      try {
        const withDeps = { ...modifiedIR, runtime: { dependencies: { zod: '^4.0.0' } } }
        const res = await post({ ir: withDeps, baseGraphHash: created.graphHash })
        expect(res.status).toBe(200)
        const file = await mockDb.getWorkflowFile('wf-1', 'package.json')
        expect(file?.source).toBe('{"dependencies":{"theirs":"1.0.0"}}')
      } finally {
        spy.mockRestore()
      }
    })

    it('does not care about metadata or project files in the base: only the graph counts', async () => {
      const created = await (await post({ ir: validIR })).json()
      await app.request(url('/api/workflows/wf-1/files/lib/x.ts'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: JSON.stringify({ source: 'export const x = 1' }),
      })
      const res = await post({
        ir: { ...modifiedIR, metadata: { ...validIR.metadata, name: 'Renamed', version: 9 } },
        baseGraphHash: created.graphHash,
      })
      expect(res.status).toBe(200)
      const doc = JSON.parse(await stored(created.id))
      expect(doc.nodes[0].data.code).toBe('return 2;')
      expect(doc.runtime.files).toEqual([{ path: 'lib/x.ts', source: 'export const x = 1' }])
    })

    it('creates the next version when the latest is deployed and the base matches', async () => {
      const created = await (await post({ ir: validIR })).json()
      await mockDb.createDeployment({
        id: 'd-1',
        workflowId: 'wf-1',
        versionId: created.id,
        connectionId: 'c-1',
        serviceName: 's',
        status: 'success',
      })
      const res = await post({ ir: modifiedIR, baseGraphHash: created.graphHash })
      expect(res.status).toBe(201)
      const next = await res.json()
      expect(next.version).toBe(created.version + 1)
      expect(next.id).not.toBe(created.id)
      expect((await mockDb.getWorkflowById('wf-1'))!.currentVersionId).toBe(next.id)
      expect(await stored(created.id)).toContain('return 1;')
    })

    it('builds on the highest version number, not the most recently saved row', async () => {
      const v1 = await mockDb.createVersion({
        id: 'v-1',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      const v2 = await mockDb.createVersion({
        id: 'v-2',
        workflowId: 'wf-1',
        ir: JSON.stringify(modifiedIR),
      })
      await mockDb.updateVersion(v2.id, { createdAt: '2020-01-01T00:00:00.000Z' })
      expect((await mockDb.listVersionsByWorkflow('wf-1')).data[0]!.id).toBe(v1.id)

      const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
      expect(full.version.id).toBe(v2.id)
      expect(full.versions[0].id).toBe(v1.id)
      const listing = await (await app.request(url('/api/workflows/wf-1/project'))).json()
      expect(listing.version.id).toBe(v2.id)

      // v2 holds modifiedIR: saving validIR with v1's hash as base is a stale base.
      const stale = await post({ ir: validIR, baseGraphHash: graphHash(JSON.stringify(validIR)) })
      expect(stale.status).toBe(409)
      const saved = await post({ ir: validIR, baseGraphHash: full.graphHash })
      expect(saved.status).toBe(200)
      expect((await saved.json()).id).toBe(v2.id)
    })

    it('re-reads and re-folds once after a lost race, so a files-only commit that landed is kept', async () => {
      const created = await (await post({ ir: validIR })).json()
      const spy = vi
        .spyOn(mockDb, 'updateLatestVersionIfIrMatches')
        .mockImplementationOnce(async (latest, expectedIr) => {
          // Another request commits a new file into the version between this
          // save's read and its write: the text moves, the graph does not.
          await mockDb.upsertWorkflowFile({
            id: 'f-1',
            workflowId: 'wf-1',
            path: 'lib/late.ts',
            source: 'export const late = 1',
            hash: contentHash('export const late = 1'),
            size: 21,
          })
          await mockDb.updateVersion(latest.id, {
            ir: JSON.stringify({
              ...JSON.parse(expectedIr),
              runtime: { files: [{ path: 'lib/late.ts', source: 'export const late = 1' }] },
            }),
          })
          return null
        })
      try {
        const res = await post({ ir: modifiedIR, baseGraphHash: created.graphHash })
        expect(res.status).toBe(200)
        expect(spy).toHaveBeenCalledTimes(2)
        const doc = JSON.parse(await stored(created.id))
        expect(doc.nodes[0].data.code).toBe('return 2;')
        expect(doc.runtime.files).toEqual([
          { path: 'lib/late.ts', source: 'export const late = 1' },
        ])
      } finally {
        spy.mockRestore()
      }
    })

    it('answers 409 with what is stored when the graph moved under a lost race', async () => {
      const created = await (await post({ ir: validIR })).json()
      const moved = { ...validIR, nodes: [{ ...validIR.nodes[0]!, name: 'Moved' }] }
      const spy = vi
        .spyOn(mockDb, 'updateLatestVersionIfIrMatches')
        .mockImplementationOnce(async (latest) => {
          await mockDb.updateVersion(latest.id, { ir: JSON.stringify(moved) })
          return null
        })
      try {
        const res = await post({ ir: modifiedIR, baseGraphHash: created.graphHash })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
          error: 'This workflow changed since it was loaded',
          currentVersionId: created.id,
          currentGraphHash: graphHash(JSON.stringify(moved)),
        })
        expect(spy).toHaveBeenCalledTimes(1)
        expect(JSON.parse(await stored(created.id)).nodes[0].name).toBe('Moved')
      } finally {
        spy.mockRestore()
      }
    })

    it('a save without a base keeps today’s behaviour: last writer wins', async () => {
      const created = await (await post({ ir: validIR })).json()
      const res = await post({ ir: modifiedIR })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: created.id })
    })
  })

  describe('POST /api/workflows/:workflowId/versions/commit', () => {
    const commit = () => app.request(url('/api/workflows/wf-1/versions/commit'), { method: 'POST' })
    const putFile = (path: string, source: string) =>
      app.request(url(`/api/workflows/wf-1/files/${path}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: JSON.stringify({ source }),
      })
    const save = (ir: unknown, baseGraphHash?: string) =>
      app.request(url('/api/workflows/wf-1/versions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir, baseGraphHash }),
      })
    const deploy = (versionId: string) =>
      mockDb.createDeployment({
        id: 'd-1',
        workflowId: 'wf-1',
        versionId,
        connectionId: 'c-1',
        serviceName: 's',
        status: 'success',
      })

    it('has nothing to commit into before the first save', async () => {
      await putFile('lib/x.ts', 'export const x = 1')
      const res = await commit()
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'No version to commit into' })
    })

    it('folds the live files into the undeployed version in place, keeping the graph hash', async () => {
      const created = await (await save(validIR)).json()
      await putFile('lib/x.ts', 'export const x = 1')
      const res = await commit()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(created.id)
      expect(body.graphHash).toBe(created.graphHash)
      expect(body.createdBy).toBe(TEST_USER_ID)
      const doc = JSON.parse(await (await mockDb.getWorkflowVersionById(created.id))!.ir)
      expect(doc.runtime.files).toEqual([{ path: 'lib/x.ts', source: 'export const x = 1' }])
      expect(doc.nodes).toEqual(JSON.parse(created.ir).nodes)
    })

    it('is a no-op when the version already holds the live files', async () => {
      const created = await (await save(validIR)).json()
      await putFile('lib/x.ts', 'export const x = 1')
      const first = await (await commit()).json()
      const before = (await mockDb.getWorkflowVersionById(created.id))!
      const res = await commit()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: created.id, graphHash: first.graphHash })
      expect(await mockDb.getWorkflowVersionById(created.id)).toEqual(before)
    })

    it('creates the next version when the current one is deployed', async () => {
      const created = await (await save(validIR)).json()
      await deploy(created.id)
      await putFile('lib/x.ts', 'export const x = 1')
      const res = await commit()
      expect(res.status).toBe(201)
      const next = await res.json()
      expect(next.version).toBe(created.version + 1)
      expect(next.graphHash).toBe(created.graphHash)
      expect((await mockDb.getWorkflowById('wf-1'))!.currentVersionId).toBe(next.id)
      const deployed = JSON.parse((await mockDb.getWorkflowVersionById(created.id))!.ir)
      expect(deployed.runtime).toBeUndefined()
    })

    it('a canvas save after a commit succeeds on the base it loaded: files do not move the graph', async () => {
      const created = await (await save(validIR)).json()
      await putFile('lib/x.ts', 'export const x = 1')
      await commit()
      const res = await save(modifiedIR, created.graphHash)
      expect(res.status).toBe(200)
      const doc = JSON.parse((await mockDb.getWorkflowVersionById(created.id))!.ir)
      expect(doc.nodes[0].data.code).toBe('return 2;')
      expect(doc.runtime.files).toEqual([{ path: 'lib/x.ts', source: 'export const x = 1' }])
    })

    it('a revert answers with the new version’s graph hash', async () => {
      const v1 = await (await save(validIR)).json()
      await deploy(v1.id)
      await save(modifiedIR)
      const res = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}/revert`), {
        method: 'POST',
      })
      expect(res.status).toBe(201)
      const reverted = await res.json()
      expect(reverted.version).toBe(3)
      expect(reverted.graphHash).toBe(v1.graphHash)
    })
  })
})
