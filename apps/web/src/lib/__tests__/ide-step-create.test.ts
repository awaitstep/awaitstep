import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import { contentHash } from '@awaitstep/ir'
import { VersionConflictError, type SavedVersion } from '../api-client'
import { loadVersionDocument } from '../ide/node-source'
import { createStepCreator, type StepCreateDeps } from '../ide/step-create'
import { createStepSaver } from '../ide/step-save'
import { useIdeStore } from '../../stores/ide-store'

const metadata = { name: 'orders', version: 3, createdAt: 't', updatedAt: 't' }
const TASK_CODE = `export default async function Fetch_user({ env, event, inputs, step, ctx }) {\n  return 1;\n}\n`
const MAIL_CODE = `export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 2;\n}\n`
const MAIL_1 = `export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 20;\n}\n`
const MAIL_2 = `export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 200;\n}\n`
const doc: ArtifactIR = {
  kind: 'workflow',
  metadata,
  nodes: [
    {
      id: 'fetch',
      type: 'step',
      name: 'Fetch user',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: TASK_CODE },
    },
    {
      id: 'mail',
      type: 'step',
      name: 'Send mail',
      position: { x: 280, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: {
        code: 'export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 2;\n}\n',
      },
    },
  ],
  edges: [{ id: 'e1', source: 'fetch', target: 'mail' }],
  entryNodeId: 'fetch',
}

function versionRow(ir: ArtifactIR, graphHash: string): SavedVersion {
  return {
    id: 'v-3',
    workflowId: 'wf-1',
    version: 3,
    ir: JSON.stringify(ir),
    locked: 0,
    createdAt: 't',
    graphHash,
  }
}

interface Harness {
  deps: StepCreateDeps
  saver: ReturnType<typeof createStepSaver>
  createVersion: ReturnType<typeof vi.fn>
  notify: { error: ReturnType<typeof vi.fn> }
  refresh: ReturnType<typeof vi.fn>
  /** When set, the refetch after a write does not move what the workspace shows. */
  refetchFails: boolean
  /** A version saved elsewhere that the workspace has refetched. */
  show(ir: ArtifactIR, graphHash: string): void
  /** A version the server holds but the workspace has not refetched (its cache still shows the old one). */
  serverOnly(ir: ArtifactIR, graphHash: string): void
  /** A refetch that did not include the latest write: the cache shows an older version than the server. */
  cacheOnly(ir: ArtifactIR, graphHash: string): void
  /** The document an earlier save posted, after the post has landed. */
  server(): ArtifactIR
}

function harness(
  initial: ArtifactIR = doc,
  graphHash = 'g-3',
  options: { isCurrent?: () => boolean; canEdit?: () => boolean } = {},
): Harness {
  let server = { version: versionRow(initial, graphHash), graphHash }
  let full = server
  const h: Partial<Harness> = { refetchFails: false }
  const createVersion = vi.fn(
    async (_id: string, data: { ir: unknown; baseGraphHash?: string }) => {
      const row = versionRow(data.ir as ArtifactIR, `g-after-${data.baseGraphHash}`)
      server = { version: row, graphHash: row.graphHash }
      return row
    },
  )
  const refresh = vi.fn(async () => {
    if (!h.refetchFails) full = server
  })
  const notify = { error: vi.fn() }
  const saver = createStepSaver({
    workflowId: 'wf-1',
    client: { createVersion },
    notify,
    getStore: useIdeStore.getState,
    isCurrent: options.isCurrent ?? (() => true),
    getVersion: () => loadVersionDocument(full),
    refresh,
  })
  const deps: StepCreateDeps = {
    workflowId: 'wf-1',
    client: { createVersion },
    notify,
    getStore: useIdeStore.getState,
    ...(options.isCurrent && { isCurrent: options.isCurrent }),
    getVersion: saver.currentVersion,
    getCachedVersion: () => loadVersionDocument(full),
    exclusive: saver.exclusive,
    remember: saver.remember,
    forget: saver.forget,
    refresh,
    canEdit: options.canEdit ?? (() => true),
    readOnlyReason: () => 'Older versions are read-only.',
    newId: () => 'newstep00000',
  }
  return Object.assign(h, {
    deps,
    saver,
    createVersion,
    notify,
    refresh,
    server: () => JSON.parse(server.version.ir) as ArtifactIR,
    show(ir: ArtifactIR, hash: string) {
      server = { version: versionRow(ir, hash), graphHash: hash }
      full = server
    },
    serverOnly(ir: ArtifactIR, hash: string) {
      server = { version: versionRow(ir, hash), graphHash: hash }
    },
    cacheOnly(ir: ArtifactIR, hash: string) {
      full = { version: versionRow(ir, hash), graphHash: hash }
    },
  }) as Harness
}

function posted(createVersion: ReturnType<typeof vi.fn>, call = 0) {
  return createVersion.mock.calls[call]![1] as { ir: ArtifactIR; baseGraphHash?: string }
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('createStepCreator', () => {
  it('posts one version with the node spliced into the edge, then opens its file', async () => {
    const h = harness()
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge card')
    expect(outcome).toEqual({
      status: 'created',
      nodeId: 'newstep00000',
      path: 'steps/newstep00000.ts',
      opened: true,
    })
    expect(h.createVersion).toHaveBeenCalledTimes(1)
    const { ir, baseGraphHash } = posted(h.createVersion)
    expect(baseGraphHash).toBe('g-3')
    expect(ir.nodes.map((n) => n.id)).toEqual(['fetch', 'mail', 'newstep00000'])
    expect(ir.edges.map((e) => [e.source, e.target])).toEqual([
      ['fetch', 'newstep00000'],
      ['newstep00000', 'mail'],
    ])
    expect(String(ir.nodes[2]!.data.code)).toContain('export default async function Charge_card(')
    expect(useIdeStore.getState().activePath).toBe('steps/newstep00000.ts')
  })

  it('appends after the last step and refreshes the workspace', async () => {
    const h = harness()
    await createStepCreator(h.deps).create({ after: 'mail' }, 'Notify')
    const { ir } = posted(h.createVersion)
    expect(ir.edges.map((e) => [e.source, e.target])).toEqual([
      ['fetch', 'mail'],
      ['mail', 'newstep00000'],
    ])
    expect(h.refresh).toHaveBeenCalled()
  })

  it('puts the step in front of a version with no steps', async () => {
    const noSteps: ArtifactIR = {
      ...doc,
      nodes: [
        {
          id: 'setup',
          type: 'sleep',
          name: 'Wait',
          version: '1.0.0',
          provider: 'cloudflare',
          data: { duration: '1 minute' },
        },
      ],
      edges: [],
      entryNodeId: 'setup',
    }
    const h = harness(noSteps)
    await createStepCreator(h.deps).create({ first: true }, 'Start')
    const { ir } = posted(h.createVersion)
    expect(ir.entryNodeId).toBe('newstep00000')
    expect(ir.edges.map((e) => [e.source, e.target])).toEqual([['newstep00000', 'setup']])
  })

  it('refuses a placement the version does not have, writing nothing', async () => {
    const h = harness()
    const outcome = await createStepCreator(h.deps).create({ after: 'gone' }, 'Charge')
    expect(outcome).toEqual({
      status: 'refused',
      reason: 'That step is not in this version any more.',
    })
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('refuses a branch without a chosen arm, writing nothing', async () => {
    const branch: ArtifactIR = {
      ...doc,
      nodes: [
        ...doc.nodes,
        {
          id: 'gate',
          type: 'branch',
          name: 'Paid?',
          position: { x: 560, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {},
        },
      ],
      edges: [
        ...doc.edges,
        { id: 'yes', source: 'gate', target: 'fetch', label: 'yes' },
        { id: 'no', source: 'gate', target: 'mail', label: 'no' },
      ],
    }
    const h = harness(branch)
    const outcome = await createStepCreator(h.deps).create({ after: 'gate' }, 'Charge')
    expect(outcome.status).toBe('refused')
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('splices the chosen arm when one is named', async () => {
    const branch: ArtifactIR = {
      ...doc,
      nodes: [
        ...doc.nodes,
        {
          id: 'gate',
          type: 'branch',
          name: 'Paid?',
          position: { x: 560, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {},
        },
      ],
      edges: [
        ...doc.edges,
        { id: 'yes', source: 'gate', target: 'fetch', label: 'yes' },
        { id: 'no', source: 'gate', target: 'mail', label: 'no' },
      ],
    }
    const h = harness(branch)
    const outcome = await createStepCreator(h.deps).create(
      { after: 'gate', edgeId: 'yes' },
      'Charge',
    )
    expect(outcome.status).toBe('created')
    const { ir } = posted(h.createVersion)
    const spliced = ir.edges.find((e) => e.source === 'gate' && e.label === 'yes')!
    expect(spliced.target).toBe('newstep00000')
    expect(ir.edges.find((e) => e.label === 'no')).toEqual(branch.edges[2])
  })

  it('turns a moved graph into the existing conflict notice and writes nothing else', async () => {
    const h = harness()
    h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-9', 'g-9'))
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome).toEqual({ status: 'graph-conflict' })
    expect(useIdeStore.getState().graphConflict).toEqual({
      currentVersionId: 'v-9',
      currentGraphHash: 'g-9',
      paths: [],
    })
    expect(h.refresh).toHaveBeenCalled()
  })

  it('keeps a save conflict’s notice when a create is also refused', async () => {
    const h = harness()
    useIdeStore.getState().setGraphConflict({
      currentVersionId: 'v-save',
      currentGraphHash: 'g-save',
      paths: ['steps/mail.ts'],
    })
    h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-9', 'g-9'))
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome).toEqual({ status: 'graph-conflict' })
    expect(useIdeStore.getState().graphConflict).toEqual({
      currentVersionId: 'v-save',
      currentGraphHash: 'g-save',
      paths: ['steps/mail.ts'],
    })
    expect(h.notify.error).toHaveBeenCalledWith(
      'Nothing was created',
      expect.objectContaining({ description: 'The canvas changed this workflow. Try again.' }),
    )
  })

  it('refuses on a workspace that cannot edit, with the reason', async () => {
    const h = harness(doc, 'g-3', { canEdit: () => false })
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome).toEqual({ status: 'refused', reason: 'Older versions are read-only.' })
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('posts nothing once the workspace has moved on', async () => {
    const h = harness(doc, 'g-3', { isCurrent: () => false })
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome.status).toBe('failed')
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('says how to get a version when there is none', async () => {
    const h = harness()
    h.deps.getVersion = () => null
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.reason).toMatch(/canvas/)
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('tells the person the server’s reason when the post fails', async () => {
    const h = harness()
    h.createVersion.mockRejectedValueOnce(new Error('nope'))
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.reason).toMatch(/nope/)
  })

  it('creates again after the graph moved once the refetch has landed', async () => {
    const h = harness()
    // The server saved a newer version elsewhere; the workspace still shows g-3.
    h.serverOnly(doc, 'g-9')
    h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-9', 'g-9'))
    const first = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(first).toEqual({ status: 'graph-conflict' })
    expect(posted(h.createVersion, 0).baseGraphHash).toBe('g-3')
    // The conflict path refetched: the same create now builds on g-9.
    const second = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(second.status).toBe('created')
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-9')
  })

  it('leaves another step’s draft untouched and saveable afterwards', async () => {
    const h = harness()
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_1, contentHash(MAIL_CODE))
    await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(useIdeStore.getState().drafts['steps/mail.ts']).toEqual({
      source: MAIL_1,
      baseHash: contentHash(MAIL_CODE),
    })
    const outcomes = await h.saver.save(['steps/mail.ts'])
    expect(outcomes.get('steps/mail.ts')).toBe('saved')
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
  })

  it('does not open a blank tab when the refetch did not land', async () => {
    const h = harness()
    h.refetchFails = true
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome.status).toBe('created')
    expect(outcome.status === 'created' && outcome.opened).toBe(false)
    expect(useIdeStore.getState().activePath).toBeNull()
    expect(h.notify.error).toHaveBeenCalledWith(
      'Created the step, but the workspace didn’t reload',
      expect.objectContaining({ description: 'Reload the page to open its file.' }),
    )
  })
})

describe('createStepCreator — one write at a time with the saver', () => {
  it('waits for a save in flight and builds on the version it produced', async () => {
    const h = harness()
    // The refetch after a save fails: only the saver's remembered response
    // knows the version the save wrote.
    h.refetchFails = true
    useIdeStore
      .getState()
      .setDraft(
        'steps/fetch.ts',
        'export default async function Fetch_user({ env, event, inputs, step, ctx }) {\n  return 10;\n}\n',
        contentHash(TASK_CODE),
      )
    let finish: (v: SavedVersion) => void = () => {}
    h.createVersion.mockImplementationOnce(
      () => new Promise<SavedVersion>((resolve) => (finish = resolve)),
    )
    const saving = h.saver.save(['steps/fetch.ts'])
    const creating = createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    // The create has not posted while the save is in flight.
    expect(h.createVersion).toHaveBeenCalledTimes(1)
    const savedDoc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'fetch' ? { ...n, data: { code: 'x' } } : n)),
    }
    finish(versionRow(savedDoc, 'g-after-g-3'))
    await saving
    const outcome = await creating
    expect(outcome.status).toBe('created')
    expect(h.createVersion).toHaveBeenCalledTimes(2)
    // The create read the save's response, not the stale cache.
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
    expect(h.server().nodes.some((n) => n.id === 'newstep00000')).toBe(true)
  })

  it('lets a save build on the version a create wrote while the refetch lags', async () => {
    const h = harness()
    h.refetchFails = true
    const outcome = await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    expect(outcome.status).toBe('created')
    useIdeStore
      .getState()
      .setDraft(
        'steps/mail.ts',
        'export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 20;\n}\n',
        contentHash(
          'export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 2;\n}\n',
        ),
      )
    await h.saver.save(['steps/mail.ts'])
    expect(h.createVersion).toHaveBeenCalledTimes(2)
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
  })

  it('holds a save asked for during a create until the create has posted', async () => {
    const h = harness()
    let finish: (v: SavedVersion) => void = () => {}
    h.createVersion.mockImplementationOnce(
      () => new Promise<SavedVersion>((resolve) => (finish = resolve)),
    )
    const creating = createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_1, contentHash(MAIL_CODE))
    const saving = h.saver.save(['steps/mail.ts'])
    // The save has not posted while the create is in flight.
    expect(h.createVersion).toHaveBeenCalledTimes(1)
    finish(versionRow(posted(h.createVersion, 0).ir, 'g-after-g-3'))
    expect((await creating).status).toBe('created')
    expect((await saving).get('steps/mail.ts')).toBe('saved')
    expect(h.createVersion).toHaveBeenCalledTimes(2)
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
  })

  it('keeps its newest write when a late refetch brings back an older version', async () => {
    const h = harness()
    h.refetchFails = true
    await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_1, contentHash(MAIL_CODE))
    await h.saver.save(['steps/mail.ts'])
    // A refetch of the create's version lands late, after the save's:
    // the cache shows the created document, not the saved one.
    h.cacheOnly(posted(h.createVersion, 0).ir, 'g-after-g-3')
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_2, null)
    await h.saver.save(['steps/mail.ts'])
    expect(h.createVersion).toHaveBeenCalledTimes(3)
    // The save still builds on the newest remembered write, not the cache.
    expect(posted(h.createVersion, 2).baseGraphHash).toBe('g-after-g-after-g-3')
  })

  it('keeps building on its own writes when the refetch never lands', async () => {
    const h = harness()
    h.refetchFails = true
    await createStepCreator(h.deps).create({ after: 'fetch' }, 'Charge')
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_1, contentHash(MAIL_CODE))
    await h.saver.save(['steps/mail.ts'])
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_2, null)
    await h.saver.save(['steps/mail.ts'])
    expect(h.createVersion).toHaveBeenCalledTimes(3)
    expect(posted(h.createVersion, 0).baseGraphHash).toBe('g-3')
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
    expect(posted(h.createVersion, 2).baseGraphHash).toBe('g-after-g-after-g-3')
  })
})

describe('createStepCreator with a caller-chosen id', () => {
  it('refuses an id an existing node already has without writing', async () => {
    const h = harness()
    const outcome = await createStepCreator(h.deps).create({ after: 'mail' }, 'Another', 'fetch')
    expect(outcome.status).toBe('refused')
    expect(h.createVersion).not.toHaveBeenCalled()
  })

  it('uses the id for the node and its steps/<id>.ts path', async () => {
    const h = harness(doc)
    const outcome = await createStepCreator(h.deps).create(
      { after: 'fetch' },
      'Notify ops',
      'notify_ops',
    )
    expect(outcome).toEqual({
      status: 'created',
      nodeId: 'notify_ops',
      path: 'steps/notify_ops.ts',
      opened: true,
    })
  })
})
