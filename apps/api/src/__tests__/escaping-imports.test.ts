import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'

function irWithStep(code: string) {
  return {
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
        data: { code },
      },
    ],
    edges: [],
    entryNodeId: 'step-1',
  }
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

/**
 * Wrangler's bundler follows any filesystem path, so an import that climbs
 * out of the bundle would pack a file from the build host into the Worker.
 * prepareWorkflow is the gate every bundling path passes.
 */
describe('imports that reach outside the project', () => {
  let app: ReturnType<typeof createTestApp>

  async function saveVersion(code: string) {
    const res = await app.request(url('/api/workflows/wf-1/versions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: irWithStep(code) }),
    })
    expect(res.status).toBe(201)
  }

  async function prepare(mode?: 'read') {
    const workflow = await mockDb.getWorkflowById('wf-1')
    return prepareWorkflow({
      db: mockDb,
      workflow: workflow!,
      organizationId: 'org-1',
      projectId: TEST_PROJECT_ID,
      ...(mode && { mode }),
    })
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

  it('refuses a deploy whose step body imports a host file', async () => {
    await saveVersion("const cfg = await import('../../../srv/app/config.json');\nreturn cfg;")

    const deploy = await prepare()

    expect(isPrepareError(deploy)).toBe(true)
    if (!isPrepareError(deploy)) return
    expect(deploy.status).toBe(422)
    expect(deploy.error).toContain('../../../srv/app/config.json')
    expect(deploy.error).toMatch(/reaches outside the project/)
  })

  it('refuses a deploy whose project file imports a host file', async () => {
    await saveVersion('return 1;')
    await mockDb.upsertWorkflowFiles([
      {
        id: 'f-1',
        workflowId: 'wf-1',
        path: 'lib/secret.ts',
        source: "export { default } from '../../etc/creds.json'",
        hash: 'h',
        size: 1,
      },
    ])

    const deploy = await prepare()

    expect(isPrepareError(deploy) && deploy.status).toBe(422)
    expect(isPrepareError(deploy) && deploy.error).toContain('lib/secret.ts')
  })

  it('reports, rather than refuses, the same import in a read', async () => {
    await saveVersion("const cfg = await import('../../../srv/app/config.json');\nreturn cfg;")

    const read = await prepare('read')

    expect(isPrepareError(read)).toBe(false)
    if (isPrepareError(read)) return
    const escapes = read.diagnostics.filter(
      (d) => d.source === 'import' && d.message.includes('reaches outside'),
    )
    expect(escapes).toHaveLength(1)
  })

  it('passes contained imports', async () => {
    await saveVersion('return 1;')

    expect(isPrepareError(await prepare())).toBe(false)
  })
})
