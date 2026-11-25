import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createProvider, useExtensionProviders } from '../lib/provider-registry.js'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'
import { resetStore, TEST_ORG_ID, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

/**
 * The refusals a strict prepare owes its callers. A deploy is the only
 * caller left that cannot proceed on a broken workflow — `GET /source` and
 * `POST /source/check` report the same problems as diagnostics instead — so
 * these are the tests that keep "it passed the check, then the deploy
 * refused it" honest about which half refuses.
 */
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

async function prepareStoredIr(
  ir: unknown,
  provider?: string,
  options: Partial<
    Pick<Parameters<typeof prepareWorkflow>[0], 'mode' | 'emptyRequiredFields' | 'connectionId'>
  > = {},
) {
  const version = await mockDb.createVersion({
    id: 'v-1',
    workflowId: 'wf-1',
    ir: JSON.stringify(ir),
  })
  await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
  const workflow = (await mockDb.getWorkflowById('wf-1'))!
  return prepareWorkflow({
    db: mockDb,
    workflow,
    organizationId: TEST_ORG_ID,
    projectId: TEST_PROJECT_ID,
    ...(provider && { provider }),
    ...options,
  })
}

describe('a strict prepare', () => {
  beforeEach(async () => {
    resetStore()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  it('refuses a stored IR that fails its schema, with the errors attached', async () => {
    const prepared = await prepareStoredIr({ ...validIR, nodes: [{ id: 'step-1' }] })
    expect(isPrepareError(prepared) && prepared.error).toBe('IR validation failed')
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    expect(isPrepareError(prepared) && prepared.details).toBeTruthy()
  })

  it('refuses a node the provider cannot deploy as configured', async () => {
    // A sub_script with no worker selected: the graph is schema-valid, so
    // only the provider's own validation catches it.
    const prepared = await prepareStoredIr({
      ...validIR,
      nodes: [
        ...validIR.nodes,
        {
          id: 'call',
          type: 'sub_script',
          name: 'call',
          position: { x: 200, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { workerName: '', method: 'POST', url: 'https://invoke/' },
        },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'call' }],
    })
    expect(isPrepareError(prepared) && prepared.error).toBe('IR validation failed')
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    const details = isPrepareError(prepared) ? (prepared.details as { message: string }[]) : []
    expect(details.some((d) => d.message.includes('no script selected'))).toBe(true)
  })

  it('names the file of code that will not compile', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      nodes: [{ ...validIR.nodes[0], data: { code: 'const x = ;' } }],
    })
    expect(isPrepareError(prepared) && prepared.status).toBe(422)
    // Without the path, a multi-file project gets "Unexpected token (3:10)"
    // and no way to tell which file it came from.
    expect(isPrepareError(prepared) && prepared.error).toMatch(/^Compile error in \S+\.ts:/)
  })

  it('prepares a healthy workflow, generating the bundle from the IR', async () => {
    const prepared = await prepareStoredIr(validIR)
    expect(isPrepareError(prepared)).toBe(false)
    if (isPrepareError(prepared)) return
    expect(prepared.bundle.files.map((f) => f.path)).toContain('worker.ts')
    expect(prepared.diagnostics).toEqual([])
  })

  it('uses the artifact’s runtime provider with no connection', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      runtime: { provider: 'cloudflare' },
    })
    expect(isPrepareError(prepared)).toBe(false)
  })

  it('refuses a connection that disagrees with the artifact target', async () => {
    const prepared = await prepareStoredIr(
      { ...validIR, runtime: { provider: 'cloudflare' } },
      'inngest',
    )
    expect(isPrepareError(prepared)).toBe(true)
    if (!isPrepareError(prepared)) return
    expect(prepared.status).toBe(400)
    expect(prepared.error).toContain('targets cloudflare')
  })

  it('accepts a connection whose provider runs what the artifact targets', async () => {
    const cloudflare = createProvider('cloudflare', {})
    const hosted = Object.assign(Object.create(cloudflare) as typeof cloudflare, {
      name: 'hosted',
      nodeProviders: ['cloudflare'],
    })
    useExtensionProviders([{ id: 'acme-ext', providers: { hosted: () => hosted } }])
    try {
      const ir = { ...validIR, runtime: { provider: 'cloudflare' } }
      const prepared = await prepareStoredIr(ir, 'hosted')
      expect(isPrepareError(prepared) ? prepared.error : null).toBeNull()
      if (!isPrepareError(prepared)) expect(prepared.adapter.name).toBe('hosted')
    } finally {
      useExtensionProviders([])
    }
  })

  it('refuses a marketplace node with a required field left empty, naming the node and field', async () => {
    const definition = {
      id: 'greeter',
      name: 'Greeter',
      version: '1.0.0',
      description: 'Greets',
      category: 'Utilities',
      author: 'awaitstep',
      license: 'MIT',
      providers: ['cloudflare'],
      configSchema: {
        target: { type: 'string', label: 'Who to greet', required: true },
        key: { type: 'secret', label: 'Key', required: true, envVarName: 'GREETER_KEY' },
      },
      outputSchema: {},
    }
    await mockDb.installNode({
      id: 'inst-1',
      organizationId: TEST_ORG_ID,
      nodeId: 'greeter',
      version: '1.0.0',
      bundle: JSON.stringify({
        definition,
        templates: {
          cloudflare: 'export default async function (ctx) { return ctx.config.target }',
        },
        bundledAt: '2026-01-01T00:00:00Z',
        checksum: 'sha256:' + '0'.repeat(64),
      }),
      installedBy: TEST_USER_ID,
    })
    const greet = (data: Record<string, unknown>) => ({
      ...validIR,
      nodes: [
        ...validIR.nodes,
        {
          id: 'greet',
          type: 'greeter',
          name: 'Say hi',
          position: { x: 200, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data,
        },
      ],
      edges: [{ id: 'e', source: 'step-1', target: 'greet' }],
    })

    const refused = await prepareStoredIr(greet({ target: '  ' }))
    expect(isPrepareError(refused) && refused.error).toBe('Say hi: Who to greet is required')
    expect(isPrepareError(refused) && refused.status).toBe(400)

    // Filled in, the field passes; the secret is left to the environment check.
    const filled = await prepareStoredIr(greet({ target: 'ops' }))
    expect(isPrepareError(filled) && filled.error).toMatch(/environment var/)
    expect(isPrepareError(filled) && filled.error).not.toMatch(/is required/)

    // A test or local run goes on; the env check is what stops this one.
    const run = await prepareStoredIr(greet({ target: '' }), undefined, {
      emptyRequiredFields: 'allow',
    })
    expect(isPrepareError(run) && run.error).not.toMatch(/is required/)

    // The source view and Check list it as a warning.
    const read = await prepareStoredIr(greet({ target: '' }), undefined, { mode: 'read' })
    expect(isPrepareError(read) ? read.error : read.diagnostics).toContainEqual({
      source: 'ir',
      nodeId: 'greet',
      message: 'Say hi: Who to greet is required',
      severity: 'warning',
    })
  })

  it('refuses an inline step that declares a name the generated code binds, and lists it on Check', async () => {
    const clash = {
      ...validIR,
      nodes: [{ ...validIR.nodes[0], data: { code: 'const step = 1', inline: true } }],
    }
    const refused = await prepareStoredIr(clash)
    expect(isPrepareError(refused) && refused.status).toBe(400)
    expect(isPrepareError(refused) && refused.error).toBe(
      'Inline step "Hello" declares `step`, which generated code uses. Rename it.',
    )
    const read = await prepareStoredIr(clash, undefined, { mode: 'read' })
    expect(isPrepareError(read) ? read.error : read.diagnostics).toContainEqual({
      source: 'ir',
      nodeId: 'step-1',
      message: 'Inline step "Hello" declares `step`, which generated code uses. Rename it.',
    })
  })

  it('refuses an expression naming a step that isn’t there, and lists it on Check', async () => {
    const broken = {
      ...validIR,
      nodes: [{ ...validIR.nodes[0], data: { code: 'return {{ghost.id}}' } }],
    }
    const message = 'Hello: There’s no step called “ghost” in this workflow.'
    const refused = await prepareStoredIr(broken)
    expect(isPrepareError(refused) && refused.status).toBe(400)
    expect(isPrepareError(refused) && refused.error).toBe(message)
    const read = await prepareStoredIr(broken, undefined, { mode: 'read' })
    expect(isPrepareError(read) ? read.error : read.diagnostics).toContainEqual({
      source: 'ir',
      nodeId: 'step-1',
      message,
    })
  })

  it('names a cycle, not the expressions on it, as what is wrong', async () => {
    const step = (id: string, code: string) => ({
      ...validIR.nodes[0],
      id,
      name: id,
      data: { code },
    })
    const cyclic = {
      ...validIR,
      nodes: [step('a', 'return {{b.id}}'), step('b', 'return 1')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    }
    const refused = await prepareStoredIr(cyclic)
    expect(isPrepareError(refused) && refused.error).toBe('IR validation failed')
    // A read can't generate a cyclic graph; its diagnostics name the cycle,
    // with no "runs after" for every ref on it.
    const read = await prepareStoredIr(cyclic, undefined, { mode: 'read' })
    const messages = (read.diagnostics ?? []).map((d) => d.message)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.some((message) => message.includes('runs after this node'))).toBe(false)
  })

  it('refuses a loop item named like a step inside the loop', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      nodes: [
        {
          id: 'each',
          type: 'loop',
          name: 'each',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { loopType: 'forEach', collection: '[1]', itemVar: 'work' },
        },
        { ...validIR.nodes[0], id: 'w', name: 'work' },
      ],
      edges: [{ id: 'e1', source: 'each', target: 'w', label: 'body' }],
      entryNodeId: 'each',
    })
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    expect(isPrepareError(prepared) && prepared.error).toBe(
      'Loop "each" item name `work` is also step "work" inside this loop. Rename one.',
    )
  })

  it('refuses an inline step importing a generated name from another module', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      nodes: [
        {
          ...validIR.nodes[0],
          id: 'prep',
          name: 'Prepare',
          data: { code: 'import { stepArgs } from "some-pkg"', inline: true },
        },
        { ...validIR.nodes[0], id: 'w', name: 'work' },
      ],
      edges: [{ id: 'e1', source: 'prep', target: 'w' }],
      entryNodeId: 'prep',
    })
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    expect(isPrepareError(prepared) && prepared.error).toBe(
      'Inline step "Prepare" imports `stepArgs` from "some-pkg", which generated code uses. Rename it with `as`.',
    )
  })
  describe('a workflow that calls another', () => {
    const calling = (target: string) => ({
      ...validIR,
      nodes: [
        {
          ...validIR.nodes[0],
          id: 'call',
          type: 'sub_workflow',
          name: 'Call it',
          data: { workflowId: target, workflowName: 'OtherWorkflow', waitForCompletion: false },
        },
      ],
      entryNodeId: 'call',
    })
    const other = { id: 'ws-other', projectId: TEST_PROJECT_ID, slug: 'other', name: 'Other' }

    beforeEach(async () => {
      await mockDb.createWorkflow({
        id: 'wf-near',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Near',
      })
      const far = (await mockDb.createWorkflow({
        id: 'wf-far',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Far',
      }))!
      // Another workspace of the same project.
      await mockDb.updateWorkflow('wf-far', { ...far, workspaceId: other.id } as never)
    })

    it('prepares a call into its own workspace', async () => {
      expect(isPrepareError(await prepareStoredIr(calling('wf-near')))).toBe(false)
    })

    it('refuses a call into another workspace, naming the node, until the target is shared', async () => {
      const refused = await prepareStoredIr(calling('wf-far'))
      expect(isPrepareError(refused) && refused).toMatchObject({
        status: 400,
        finding: true,
        error:
          'This calls "wf-far", which it cannot reach. A workflow or function can call what is in its own workspace, and what another workspace of its project has shared.',
        diagnostics: [{ source: 'ir', nodeId: 'call' }],
      })
      await mockDb.setWorkflowShared('wf-far', other.id, TEST_USER_ID, true)
      expect(isPrepareError(await prepareStoredIr(calling('wf-far')))).toBe(false)
    })

    it('reports it as a diagnostic on a read, without refusing', async () => {
      const read = await prepareStoredIr(calling('wf-far'), undefined, { mode: 'read' })
      expect(isPrepareError(read)).toBe(false)
      expect(!isPrepareError(read) && read.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ nodeId: 'call', source: 'ir' })]),
      )
    })

    it('does not judge a name that is no workflow here', async () => {
      expect(isPrepareError(await prepareStoredIr(calling('someone-elses-worker')))).toBe(false)
    })

    describe('where calls are strict', () => {
      // `hosted` is the instance's own target; `cloudflare` is an account a project connects.
      const hostedProvider = () =>
        Object.assign(createProvider('cloudflare', {}), {
          name: 'hosted',
          nodeProviders: ['cloudflare'],
        })
      const outside = calling('someone-elses-worker')
      // An account this project alone uses; `shared` is one every project may deploy to.
      const connectOwnAccount = (id = 'conn-own', shared = false) =>
        mockDb.createConnection({
          id,
          organizationId: TEST_ORG_ID,
          createdBy: TEST_USER_ID,
          provider: 'cloudflare',
          credentials: '{}',
          name: 'Own',
          allProjects: shared,
        })

      beforeEach(() => {
        useExtensionProviders([
          { id: 'strict', strictCallTargets: true, providers: { hosted: hostedProvider } },
        ])
      })
      afterEach(() => useExtensionProviders([]))

      it('refuses a name that is no workflow here, naming the node', async () => {
        const refused = await prepareStoredIr(outside)
        expect(isPrepareError(refused) && refused).toMatchObject({
          status: 400,
          finding: true,
          diagnostics: [{ source: 'ir', nodeId: 'call' }],
        })
        expect(isPrepareError(await prepareStoredIr(calling('wf-near')))).toBe(false)
      })

      it('does not count the instance’s own target as an account of the project’s own', async () => {
        await mockDb.createConnection({
          id: 'conn-hosted',
          organizationId: TEST_ORG_ID,
          createdBy: TEST_USER_ID,
          provider: 'hosted',
          credentials: '{}',
          name: 'Hosted',
        })
        expect(isPrepareError(await prepareStoredIr(outside))).toBe(true)
      })

      it('lets it through once the project has an account of its own, with no provider named', async () => {
        await connectOwnAccount()
        expect(isPrepareError(await prepareStoredIr(outside))).toBe(false)
        // What is known and out of reach is refused all the same.
        expect(isPrepareError(await prepareStoredIr(calling('wf-far')))).toBe(true)
      })

      it('goes by the provider a deploy names: the instance’s own refuses, a connected account does not', async () => {
        await connectOwnAccount()
        expect(isPrepareError(await prepareStoredIr(outside, 'hosted'))).toBe(true)
        expect(isPrepareError(await prepareStoredIr(outside, 'cloudflare'))).toBe(false)
      })

      it('does not count an account other projects deploy to as well', async () => {
        await connectOwnAccount('conn-org', true)
        // Another project's Worker could be named there.
        expect(isPrepareError(await prepareStoredIr(outside))).toBe(true)
        const onOrg = { connectionId: 'conn-org' }
        expect(isPrepareError(await prepareStoredIr(outside, 'cloudflare', onOrg))).toBe(true)
        // The project's own account lets it through, but only a deploy to that one.
        await connectOwnAccount()
        expect(isPrepareError(await prepareStoredIr(outside, 'cloudflare', onOrg))).toBe(true)
        const onOwn = { connectionId: 'conn-own' }
        expect(isPrepareError(await prepareStoredIr(outside, 'cloudflare', onOwn))).toBe(false)
      })

      it('refuses an unknown name deployed as AwaitStep’s, even on the project’s own account', async () => {
        await connectOwnAccount()
        // A deleted workflow's Worker, in any case.
        for (const name of ['awaitstep-gone', 'AwaitStep-Gone']) {
          const ir = calling(name)
          expect(isPrepareError(await prepareStoredIr(ir))).toBe(true)
          const onOwn = { connectionId: 'conn-own' }
          expect(isPrepareError(await prepareStoredIr(ir, 'cloudflare', onOwn))).toBe(true)
        }
      })
    })
  })
})
