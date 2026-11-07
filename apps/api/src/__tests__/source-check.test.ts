import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MAX_PROJECT_FILES, MAX_PROJECT_FILE_BYTES } from '@awaitstep/ir'
import {
  createTestApp,
  resetStore,
  setWorkflowKind,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_PROJECT_ID,
  mockDb,
} from './helpers.js'

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

interface CheckBody {
  ok: boolean
  versionId: string
  checked: string[]
  requirements?: { kind: string; id: string; label: string }[]
  diagnostics: { source: string; message: string; path?: string; nodeId?: string }[]
}

type Candidate = { path: string; source: string | null }

describe('POST /api/workflows/:workflowId/source/check', () => {
  let app: ReturnType<typeof createTestApp>

  function url(path: string) {
    return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
  }

  function request(path: string, init?: RequestInit) {
    return app.request(url(path), init)
  }

  async function check(
    query = '',
    files?: Candidate[],
  ): Promise<{ status: number; body: CheckBody }> {
    const res = await request(
      `/api/workflows/wf-1/source/check${query}`,
      files
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files }),
          }
        : { method: 'POST' },
    )
    return { status: res.status, body: (await res.json()) as CheckBody }
  }

  async function putFile(path: string, source: string) {
    const res = await request(`/api/workflows/wf-1/files/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    })
    // 201 created, 200 replaced.
    expect([200, 201]).toContain(res.status)
  }

  async function saveVersion(ir: unknown = validIR) {
    const res = await request('/api/workflows/wf-1/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string }
  }

  /**
   * A second version row, so one of them is no longer current. A second
   * `POST /versions` would overwrite the first in place (it is undeployed),
   * which is the behaviour, not a way to get two versions.
   */
  async function addCurrentVersion(id: string) {
    const version = await mockDb.createVersion({
      id,
      workflowId: 'wf-1',
      ir: JSON.stringify(validIR),
    })
    await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
    return version
  }

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('stored state', () => {
    it('reports a healthy workflow as ok, with nothing to fix', async () => {
      await saveVersion()
      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.diagnostics).toEqual([])
    })

    it('answers without a body, a Content-Type, or anything else to get right', async () => {
      // The plainest form of the question an agent asks. Hono's JSON
      // validator would refuse this for the missing header alone.
      await saveVersion()
      const res = await app.request(url('/api/workflows/wf-1/source/check'), { method: 'POST' })
      expect(res.status).toBe(200)
    })

    it('says what it checked, and never claims a type check', async () => {
      await saveVersion()
      const { body } = await check()
      expect(body.checked).toEqual(['ir', 'provider', 'env', 'compile', 'import'])
      expect(body.checked).not.toContain('type')
      // The canvas owns the generated code, so nothing can drift from it —
      // and `checked` says so rather than leaving an agent to assume drift
      // was considered.
      expect(body.checked).not.toContain('drift')
    })

    it('reads each row it needs once', async () => {
      await saveVersion()
      const versions = vi.spyOn(mockDb, 'getWorkflowVersionById')
      const files = vi.spyOn(mockDb, 'listWorkflowFiles')

      await check()

      // The route reads the version row and hands it to the prepare, which
      // would otherwise fetch the same row again — as would the legacy
      // trigger-code lookup behind the write rules.
      expect(versions).toHaveBeenCalledTimes(1)
      expect(files).toHaveBeenCalledTimes(1)

      // Candidates add a handler entry, which is what makes the write rules
      // look for legacy trigger code — still no second read of either row.
      versions.mockClear()
      files.mockClear()
      await check('', [{ path: 'handlers/fetch.ts', source: 'export default async () => {}' }])
      expect(versions).toHaveBeenCalledTimes(1)
      expect(files).toHaveBeenCalledTimes(1)
    })

    it('returns a verdict, never the source', async () => {
      await saveVersion()
      const { body } = await check()
      expect(Object.keys(body).sort()).toEqual([
        'checked',
        'diagnostics',
        'ok',
        'requirements',
        'versionId',
      ])
    })

    it('reports a node the provider cannot deploy, by id, still 200', async () => {
      // Written straight to the store: a save refuses this, but a workflow
      // that already holds one still has to be checkable.
      const version = await mockDb.createVersion({
        id: 'v-foreign',
        workflowId: 'wf-1',
        ir: JSON.stringify({
          ...validIR,
          nodes: [{ ...validIR.nodes[0], provider: 'aws' }],
        }),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })

      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body.ok).toBe(false)
      expect(body.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: 'provider', nodeId: 'step-1' })]),
      )
    })

    it('names every file that will not parse', async () => {
      await saveVersion()
      await putFile('lib/one.ts', 'export const a = (')
      await putFile('lib/two.ts', 'export const b = {')

      const { body } = await check()
      const compile = body.diagnostics.filter((d) => d.source === 'compile')
      expect(compile.map((d) => d.path).sort()).toEqual(['lib/one.ts', 'lib/two.ts'])
      // A project file is nobody's step: no node to open for it.
      expect(compile.every((d) => d.nodeId === undefined)).toBe(true)
    })

    it('reports a graph that cannot be generated as a finding, not a failure', async () => {
      const version = await mockDb.createVersion({
        id: 'v-cycle',
        workflowId: 'wf-1',
        ir: JSON.stringify({
          ...validIR,
          nodes: [
            {
              ...validIR.nodes[0],
              data: { code: "import { inngest } from '#awaitstep/inngest'\nreturn 1" },
            },
            { ...validIR.nodes[0], id: 'step-2', name: 'Second' },
          ],
          edges: [
            { id: 'e1', source: 'step-1', target: 'step-2' },
            { id: 'e2', source: 'step-2', target: 'step-1' },
          ],
        }),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })

      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body.ok).toBe(false)
      expect(body.diagnostics.some((d) => d.source === 'ir')).toBe(true)
      // A finding still reports the capability constraint, so an agent that
      // cannot open the source can still tell the workflow needs a provider.
      expect(body.requirements).toContainEqual(
        expect.objectContaining({ kind: 'provider', id: 'inngest' }),
      )
    })

    it('reports an env var that will not resolve, naming it and never its value', async () => {
      await saveVersion()
      // One variable that resolves to a real secret and one that cannot:
      // the check has to name the second without carrying the first.
      vi.spyOn(mockDb, 'decodeWorkflowEnvVars').mockResolvedValue([
        { name: 'PRESENT', value: '{{global.env.SHARED_TOKEN}}', isSecret: true },
        { name: 'ABSENT', value: '{{global.env.NOT_A_TOKEN}}', isSecret: true },
      ])
      vi.spyOn(mockDb, 'findEnvVarsByNames').mockResolvedValue([
        {
          id: 'ev-1',
          organizationId: TEST_ORG_ID,
          projectId: TEST_PROJECT_ID,
          workspaceId: null,
          name: 'SHARED_TOKEN',
          value: 'super-secret-value',
          isSecret: true,
          allPlaces: true,
          createdBy: TEST_USER_ID,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body.ok).toBe(false)
      const env = body.diagnostics.find((d) => d.source === 'env')
      expect(env?.message).toContain('ABSENT')
      expect(JSON.stringify(body)).not.toContain('super-secret-value')
    })

    it('reports an import no project file can satisfy, and clears it when spelled right', async () => {
      await saveVersion()
      await putFile('lib/retry.ts', 'export const retry = 1')
      await putFile('lib/use.ts', "import { retry } from '#app/lib/missing'\nexport default retry")

      const broken = await check()
      expect(broken.body.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: 'import', path: 'lib/use.ts' })]),
      )

      await putFile('lib/use.ts', "import { retry } from '#app/lib/retry'\nexport default retry")
      const fixed = await check()
      expect(fixed.body.diagnostics.filter((d) => d.source === 'import')).toEqual([])
    })

    it('checks the version asked for, not only the current one', async () => {
      const first = await saveVersion()
      await addCurrentVersion('v-2')

      const older = await check(`?versionId=${first.id}`)
      expect(older.status).toBe(200)
      expect(older.body.versionId).toBe(first.id)

      const current = await check()
      expect(current.body.versionId).toBe('v-2')
    })

    it('treats an empty versionId as none asked for: the current version is checked', async () => {
      await saveVersion()
      const { status, body } = await check('?versionId=')
      expect(status).toBe(200)
      expect(body.versionId).not.toBeNull()
    })

    it('refuses a version that belongs to another workflow', async () => {
      await saveVersion()
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Other',
      })
      await mockDb.createVersion({ id: 'v-other', workflowId: 'wf-2', ir: JSON.stringify(validIR) })
      const { status } = await check('?versionId=v-other')
      expect(status).toBe(404)
    })

    it('checks a function, not only a workflow', async () => {
      setWorkflowKind('wf-1', 'script')
      await saveVersion({ ...validIR, kind: 'script', trigger: { type: 'http' } })
      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('answers ok:false with the no-saved-version finding, not a refusal, when there is no version yet', async () => {
      const { status, body } = await check()
      expect(status).toBe(200)
      expect(body).toEqual({
        ok: false,
        versionId: null,
        checked: ['compile', 'import'],
        requirements: [],
        diagnostics: [{ source: 'ir', message: 'No saved version. Save a version first.' }],
      })
    })

    it('still refuses candidate files without a version: they are judged against generated code', async () => {
      const { status } = await check('', [{ path: 'lib/a.ts', source: 'export const a = 1' }])
      expect(status).toBe(400)
    })
  })

  describe('candidate files', () => {
    beforeEach(async () => {
      await saveVersion()
    })

    it('judges a file that was never stored, and stores nothing', async () => {
      const { status, body } = await check('', [
        { path: 'lib/draft.ts', source: 'export const a = (' },
      ])
      expect(status).toBe(200)
      expect(body.ok).toBe(false)
      expect(body.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'compile', path: 'lib/draft.ts' }),
        ]),
      )

      const stored = await request('/api/workflows/wf-1/project')
      const project = (await stored.json()) as { files: { path: string }[] }
      // Only the HTTP entry the first save seeded; the candidate stored nothing.
      expect(project.files.map((f) => f.path)).toEqual(['handlers/fetch.ts'])
    })

    it('judges a fix for a file that is broken in storage', async () => {
      await putFile('lib/broken.ts', 'export const a = (')
      expect((await check()).body.ok).toBe(false)

      const fixed = await check('', [{ path: 'lib/broken.ts', source: 'export const a = 1' }])
      expect(fixed.body.ok).toBe(true)
    })

    it('judges the candidates as one set, not file by file', async () => {
      // Two files that are only valid together. Dropping either from the
      // body is what proves the overlay is doing the work.
      const together: Candidate[] = [
        { path: 'lib/dep.ts', source: 'export const dep = 1' },
        { path: 'lib/use.ts', source: "import { dep } from '#app/lib/dep'\nexport default dep" },
      ]
      expect((await check('', together)).body.ok).toBe(true)

      const alone = await check('', [together[1]!])
      expect(alone.body.ok).toBe(false)
      expect(alone.body.diagnostics.some((d) => d.source === 'import')).toBe(true)
    })

    it('answers what a deletion would break', async () => {
      await putFile('lib/dep.ts', 'export const dep = 1')
      await putFile('lib/use.ts', "import { dep } from '#app/lib/dep'\nexport default dep")
      expect((await check()).body.ok).toBe(true)

      const { body } = await check('', [{ path: 'lib/dep.ts', source: null }])
      expect(body.ok).toBe(false)
      expect(body.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: 'import', path: 'lib/use.ts' })]),
      )
    })

    it('refuses a candidate the save path would refuse, with the save path’s reason', async () => {
      const res = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ path: 'worker.ts', source: 'export default {}' }] }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { error: string; details: { message: string }[] }
      expect(body.details.some((d) => d.message.includes('is generated from the canvas'))).toBe(
        true,
      )
    })

    it('refuses a candidate the write rules would refuse, worded as a write', async () => {
      // A second file for one handler role: two paths that collide for
      // neither the compiler nor the path rules, so only the write rules
      // see it — which is why the check has to run them too.
      await putFile('handlers/fetch.ts', 'export default async () => new Response("x")')
      const res = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'handlers/fetch.mjs', source: 'export default async () => {}' }],
        }),
      })
      expect(res.status).toBe(422)
      expect((await res.json()).error).toBe(
        'Invalid handler path "handlers/fetch.mjs": would be a second fetch handler beside "handlers/fetch.ts" — one file per entry',
      )
    })

    it('refuses an edit that pushes an already-over-limit project further over', async () => {
      // Written straight to the table, past the count cap. The cap problem
      // is pre-existing, but adding to it is not something a save accepts.
      const rows = Array.from({ length: MAX_PROJECT_FILES + 2 }, (_, i) => ({
        id: `f-${i}`,
        workflowId: 'wf-1',
        path: `lib/f${i}.ts`,
        source: 'export const a = 1',
        hash: `h${i}`,
        size: 18,
      }))
      await mockDb.upsertWorkflowFiles(rows)

      const adding = await check('', [{ path: 'lib/extra.ts', source: 'export const a = 1' }])
      expect(adding.status).toBe(422)

      // Replacing a file in place leaves the count alone, so it is judged
      // on its own merits rather than on the cap it did not move.
      const replacing = await check('', [{ path: 'lib/f0.ts', source: 'export const a = 2' }])
      expect(replacing.status).toBe(200)
    })

    it('lets project files be checked on a locked version', async () => {
      // A lock pins what is deployed. It does not stop `PUT`/`DELETE /files`,
      // which never consult it — project files belong to the workflow, not
      // to a version — so refusing here would block an edit a save takes.
      const workflow = (await mockDb.getWorkflowById('wf-1'))!
      await mockDb.updateVersion(workflow.currentVersionId!, { locked: 1 })

      const { status, body } = await check('', [{ path: 'lib/a.ts', source: 'export const a = 1' }])
      expect(status).toBe(200)
      expect(body.ok).toBe(true)

      const put = await request('/api/workflows/wf-1/files/lib/a.ts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'export const a = 1' }),
      })
      expect(put.status).toBe(201)
    })

    it('models a deletion only for a file that is actually there', async () => {
      // `DELETE /files` on a path with no row is a 404 and retires nothing,
      // so a candidate deleting a handlers.ts that was never stored must
      // not clear the legacy setting either.
      // The legacy setting cannot sit beside the HTTP entry a fresh first
      // save seeds: drop the seeded module first.
      await request('/api/workflows/wf-1/files/handlers/fetch.ts', { method: 'DELETE' })
      await mockDb.updateWorkflow('wf-1', { triggerCode: 'return new Response("legacy")' })
      const { status, body } = await check('', [
        { path: 'handlers.ts', source: null },
        { path: 'handlers/fetch.ts', source: 'export default async () => {}' },
      ])
      expect(status).toBe(422)
      expect(body).toMatchObject({
        error: expect.stringContaining('convert it to handler modules'),
      })

      const del = await request('/api/workflows/wf-1/files/handlers.ts', { method: 'DELETE' })
      expect(del.status).toBe(404)
      expect((await mockDb.getWorkflowById('wf-1'))!.triggerCode).toBe(
        'return new Response("legacy")',
      )
    })

    it('models a deletion retiring the setting the file stood in for', async () => {
      // DELETE handlers.ts clears the legacy trigger-code setting, so a
      // candidate that deletes it and adds a handler module is exactly the
      // sequence the real endpoints allow. Judging the module against a
      // workflow that still holds the setting refuses a valid edit.
      // The legacy setting cannot sit beside the HTTP entry a fresh first
      // save seeds: drop the seeded module first.
      await request('/api/workflows/wf-1/files/handlers/fetch.ts', { method: 'DELETE' })
      await mockDb.updateWorkflow('wf-1', { triggerCode: 'return new Response("legacy")' })
      await putFile('handlers.ts', '@fetch function h() { return new Response("x") }')

      const blocked = await check('', [
        { path: 'handlers/fetch.ts', source: 'export default async () => {}' },
      ])
      expect(blocked.status).toBe(422)

      const { status, body } = await check('', [
        { path: 'handlers.ts', source: null },
        { path: 'handlers/fetch.ts', source: 'export default async () => {}' },
      ])
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('does not let a problem already in storage refuse every candidate', async () => {
      // Written straight to the table, the way an import or an older client
      // could have: a manifest the current rules reject. It is reported as
      // a diagnostic, but it is not this candidate's fault.
      await mockDb.upsertWorkflowFiles([
        {
          id: 'f-bad',
          workflowId: 'wf-1',
          path: 'package.json',
          source: '{"type":"commonjs"}',
          hash: 'h',
          size: 20,
        },
      ])
      const { status, body } = await check('', [
        { path: 'lib/unrelated.ts', source: 'export const a = 1' },
      ])
      expect(status).toBe(200)
      expect(body.ok).toBe(false)
      expect(body.diagnostics.some((d) => d.message.includes('ES modules'))).toBe(true)
    })

    it('still refuses a candidate that introduces the problem itself', async () => {
      const res = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ path: 'package.json', source: '{"type":"commonjs"}' }] }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { details: { message: string }[] }
      expect(body.details.some((d) => d.message.includes('ES modules'))).toBe(true)
    })

    it('refuses a candidate for a file whose stored copy has the same flaw', async () => {
      // The write path validates the content of the file it is given, every
      // time. "Storage is already broken this way" cannot excuse a write,
      // so it must not excuse the check either.
      await mockDb.upsertWorkflowFiles([
        {
          id: 'f-bad',
          workflowId: 'wf-1',
          path: 'package.json',
          source: '{"type":"commonjs"}',
          hash: 'h',
          size: 20,
        },
      ])
      const res = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ path: 'package.json', source: '{"type":"commonjs"}' }] }),
      })
      expect(res.status).toBe(422)

      // And the real write agrees.
      const put = await request('/api/workflows/wf-1/files/package.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '{"type":"commonjs"}' }),
      })
      expect(put.status).toBe(422)
    })

    it('refuses candidates against an older version instead of ignoring them', async () => {
      const first = await mockDb.getWorkflowById('wf-1')
      const older = first!.currentVersionId!
      await addCurrentVersion('v-2')

      const res = await request(`/api/workflows/wf-1/source/check?versionId=${older}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ path: 'lib/a.ts', source: 'export const a = 1' }] }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/current version/)
    })

    it('refuses more candidates than a project can hold, or one too large', async () => {
      const many = Array.from({ length: MAX_PROJECT_FILES + 1 }, (_, i) => ({
        path: `lib/f${i}.ts`,
        source: 'export const a = 1',
      }))
      const tooMany = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: many }),
      })
      expect(tooMany.status).toBe(422)

      const tooBig = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'lib/big.ts', source: 'a'.repeat(MAX_PROJECT_FILE_BYTES + 1) }],
        }),
      })
      expect(tooBig.status).toBe(422)
    })

    it('refuses a body that does not parse rather than reading it as no candidates', async () => {
      const res = await request('/api/workflows/wf-1/source/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"files":[',
      })
      expect(res.status).toBe(422)
      expect((await res.json()).details[0].message).toMatch(/not valid JSON/)
    })
  })
})
