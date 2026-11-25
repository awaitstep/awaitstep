import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import { contentHash } from '@awaitstep/ir'
import { ApiError, VersionConflictError, type SavedVersion } from '../api-client'
import { editedVersion, waitingOps } from '../ide/graph-ops'
import { discardGraphOp, discardLastGraphOp, pruneGraphOps } from '../ide/graph-ops-actions'
import { loadVersionDocument, type LoadedVersion } from '../ide/node-source'
import { createStepCreator, type StepCreateDeps } from '../ide/step-create'
import { GRAPH_EDITS_KEY, createStepSaver } from '../ide/step-save'
import { useIdeStore } from '../../stores/ide-store'

const metadata = { name: 'orders', version: 3, createdAt: 't', updatedAt: 't' }
const TASK_CODE = `export default async function Fetch_user({ env, event, inputs, step, ctx }) {\n  return 1;\n}\n`
const MAIL_CODE = `export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 2;\n}\n`
const MAIL_EDIT = `export default async function Send_mail({ env, event, inputs, step, ctx }) {\n  return 20;\n}\n`
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
      data: { code: MAIL_CODE },
    },
    {
      id: 'hello',
      type: 'custom:hello',
      name: 'Say hello',
      position: { x: 560, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { greeting: 'hi', retries: 1 },
    },
  ],
  edges: [
    { id: 'e1', source: 'fetch', target: 'mail' },
    { id: 'e2', source: 'mail', target: 'hello' },
  ],
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

function harness(options: { canEdit?: boolean } = {}) {
  let server = { version: versionRow(doc, 'g-3'), graphHash: 'g-3' }
  let full = server
  const createVersion = vi.fn(
    async (_id: string, data: { ir: unknown; baseGraphHash?: string }) => {
      const row = versionRow(data.ir as ArtifactIR, `g-after-${data.baseGraphHash}`)
      server = { version: row, graphHash: row.graphHash }
      return row
    },
  )
  const refresh = vi.fn(async () => {
    full = server
  })
  const notify = { error: vi.fn(), info: vi.fn() }
  const saver = createStepSaver({
    workflowId: 'wf-1',
    client: { createVersion },
    notify,
    getStore: useIdeStore.getState,
    getVersion: () => loadVersionDocument(full),
    refresh,
  })
  let ids = 0
  const deps: StepCreateDeps = {
    getStore: useIdeStore.getState,
    getVersion: saver.currentVersion,
    canEdit: () => options.canEdit ?? true,
    readOnlyReason: () => 'Older versions are read-only.',
    newId: () => `new${++ids}`,
  }
  return {
    creator: createStepCreator(deps),
    saver,
    createVersion,
    notify,
    refresh,
    /** What the workspace shows: the cached version with the pending edits replayed. */
    shown(): ArtifactIR {
      const loaded = loadVersionDocument(full)!
      return editedVersion(loaded, useIdeStore.getState().graphOps).version.doc
    },
    loaded: (): LoadedVersion => loadVersionDocument(full)!,
    /** A version the canvas saved and the workspace refetched. */
    canvasSaved(ir: ArtifactIR, hash: string) {
      server = { version: versionRow(ir, hash), graphHash: hash }
      full = server
    },
    /** A version the canvas saved that the workspace has not refetched yet. */
    canvasSavedUnseen(ir: ArtifactIR, hash: string) {
      server = { version: versionRow(ir, hash), graphHash: hash }
    },
  }
}

function posted(createVersion: ReturnType<typeof vi.fn>, call = 0) {
  return createVersion.mock.calls[call]![1] as { ir: ArtifactIR; baseGraphHash?: string }
}

function waiting() {
  return waitingOps(useIdeStore.getState().graphOps)
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('Add, Remove and field Save record pending edits', () => {
  it('adds a step without a network write, shows it and opens its new file', () => {
    const h = harness()
    const outcome = h.creator.create({ after: 'fetch' }, 'Charge card')
    expect(outcome).toEqual({ status: 'created', nodeId: 'new1', path: 'steps/new1.ts' })
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(waiting().map((entry) => entry.label)).toEqual(['Added “Charge card”'])
    const shown = h.shown()
    expect(shown.edges.map((e) => [e.source, e.target])).toEqual([
      ['fetch', 'new1'],
      ['new1', 'mail'],
      ['mail', 'hello'],
    ])
    expect(useIdeStore.getState().activePath).toBe('steps/new1.ts')
  })

  it('selects a custom node it adds, which has no file', () => {
    const h = harness()
    const outcome = h.creator.create({ after: 'mail' }, 'Ping', undefined, {
      type: 'custom:ping',
      data: { url: 'https://x' },
    })
    expect(outcome).toEqual({ status: 'created', nodeId: 'new1', path: null })
    expect(useIdeStore.getState().selectedNodeId).toBe('new1')
    expect(h.shown().nodes.find((n) => n.id === 'new1')?.data).toEqual({ url: 'https://x' })
  })

  it('refuses an add the graph cannot take and records nothing', () => {
    const h = harness()
    expect(h.creator.create({ after: 'gone' }, 'X')).toEqual({
      status: 'refused',
      reason: 'That step is not in this version any more.',
    })
    expect(waiting()).toEqual([])
  })

  it('places an add after a step another pending add put there', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'One')
    expect(h.creator.create({ after: 'new1' }, 'Two').status).toBe('created')
    expect(
      h
        .shown()
        .edges.slice(-2)
        .map((e) => [e.source, e.target]),
    ).toEqual([
      ['hello', 'new1'],
      ['new1', 'new2'],
    ])
  })

  it('refuses every edit where the workspace cannot edit', () => {
    const h = harness({ canEdit: false })
    const refused = { status: 'refused', reason: 'Older versions are read-only.' }
    expect(h.creator.create({ after: 'fetch' }, 'X')).toEqual(refused)
    expect(h.creator.remove('mail')).toEqual(refused)
    expect(h.creator.saveNodeFields('hello', (current) => ({ ...current, retries: 3 }))).toEqual(
      refused,
    )
    expect(useIdeStore.getState().graphOps).toEqual([])
  })

  it('records a field edit in plain words and shows the edited values', () => {
    const h = harness()
    const data = doc.nodes[2]!.data
    expect(h.creator.saveNodeFields('hello', () => ({ ...data, retries: 3 }))).toEqual({
      status: 'recorded',
    })
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(waiting().map((entry) => entry.label)).toEqual(['Changed retries on “Say hello”'])
    expect(h.shown().nodes[2]!.data).toEqual({ greeting: 'hi', retries: 3 })
  })

  it('removes a node, closing its file and keeping its draft on the edit', () => {
    const h = harness()
    const store = useIdeStore.getState()
    store.openFile('steps/mail.ts')
    store.setDraft('steps/mail.ts', MAIL_EDIT, contentHash(MAIL_CODE))
    expect(h.creator.remove('mail')).toEqual({ status: 'removed', nodeId: 'mail' })
    expect(h.createVersion).not.toHaveBeenCalled()
    const state = useIdeStore.getState()
    expect(state.drafts['steps/mail.ts']).toBeUndefined()
    expect(state.openPaths).not.toContain('steps/mail.ts')
    expect(waiting()[0]!.stashedDraft?.draft.source).toBe(MAIL_EDIT)
    expect(h.shown().nodes.map((n) => n.id)).toEqual(['fetch', 'hello'])
  })

  it('refuses removing the last node', () => {
    const h = harness()
    h.creator.remove('mail')
    h.creator.remove('hello')
    expect(h.creator.remove('fetch')).toEqual({
      status: 'refused',
      reason: 'A workflow needs at least one node. Add another first.',
    })
  })

  it('un-adds a pending node instead of recording a removal, with its field edits', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'Ping', undefined, { type: 'custom:ping', data: {} })
    h.creator.saveNodeFields('new1', (current) => ({ ...current, url: 'a' }))
    useIdeStore.getState().setDraft('steps/new1.ts', 'x', null)
    h.creator.remove('new1')
    expect(useIdeStore.getState().graphOps).toEqual([])
    expect(useIdeStore.getState().drafts['steps/new1.ts']).toBeUndefined()
  })

  it('records a removal of a pending node that a later add builds on', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'One')
    h.creator.create({ after: 'new1' }, 'Two')
    h.creator.remove('new1')
    expect(waiting().map((entry) => entry.op.kind)).toEqual(['insert', 'insert', 'remove'])
    expect(
      h
        .shown()
        .edges.slice(-1)
        .map((e) => [e.source, e.target]),
    ).toEqual([['hello', 'new2']])
  })
})

describe('Save writes the pending edits and step drafts as one version', () => {
  it('posts one version with every pending edit and draft, then lists nothing', async () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'Notify')
    h.creator.saveNodeFields('hello', (current) => ({ ...current, retries: 5 }))
    const store = useIdeStore.getState()
    store.setDraft('steps/mail.ts', MAIL_EDIT, contentHash(MAIL_CODE))
    // Typed into the new file: built on the scaffold it opened with.
    const scaffold = String(h.shown().nodes.find((n) => n.id === 'new1')!.data.code)
    store.setDraft(
      'steps/new1.ts',
      'export default async function Notify() {\n  return 3;\n}\n',
      contentHash(scaffold),
    )

    const outcomes = await h.saver.save(['steps/mail.ts', 'steps/new1.ts'])
    expect(h.createVersion).toHaveBeenCalledTimes(1)
    const { ir, baseGraphHash } = posted(h.createVersion)
    expect(baseGraphHash).toBe('g-3')
    expect(ir.nodes.map((n) => n.id)).toEqual(['fetch', 'mail', 'hello', 'new1'])
    expect(ir.nodes[1]!.data.code).toBe(MAIL_EDIT)
    expect(ir.nodes[2]!.data.retries).toBe(5)
    expect(String(ir.nodes[3]!.data.code)).toContain('return 3;')
    expect(outcomes.get(GRAPH_EDITS_KEY)).toBe('saved')
    expect(outcomes.get('steps/mail.ts')).toBe('saved')
    expect(waiting()).toEqual([])
  })

  it('saves pending edits on their own when no draft is asked for', async () => {
    const h = harness()
    h.creator.remove('mail')
    const outcomes = await h.saver.save([GRAPH_EDITS_KEY])
    expect(outcomes.get(GRAPH_EDITS_KEY)).toBe('saved')
    expect(posted(h.createVersion).ir.nodes.map((n) => n.id)).toEqual(['fetch', 'hello'])
    // Once the refetch shows the new version, the written edits go for good.
    pruneGraphOps(useIdeStore.getState, h.loaded(), h.notify)
    expect(useIdeStore.getState().graphOps).toEqual([])
    expect(h.shown().nodes.map((n) => n.id)).toEqual(['fetch', 'hello'])
  })

  it('keeps showing written edits while the refetch still shows the old version', async () => {
    const h = harness()
    h.creator.remove('mail')
    h.refresh.mockImplementationOnce(async () => undefined)
    await h.saver.save([GRAPH_EDITS_KEY])
    expect(waiting()).toEqual([])
    expect(h.shown().nodes.map((n) => n.id)).toEqual(['fetch', 'hello'])
  })

  it('keeps the edits and drafts when the server refuses the version, with its reason', async () => {
    const h = harness()
    h.creator.remove('mail')
    useIdeStore.getState().setDraft('steps/fetch.ts', TASK_CODE + '\n', contentHash(TASK_CODE))
    h.createVersion.mockRejectedValueOnce(
      new ApiError('An arm cannot lead straight into a join.', 400),
    )
    const outcomes = await h.saver.save(['steps/fetch.ts'])
    expect(outcomes.get(GRAPH_EDITS_KEY)).toBe('failed')
    expect(h.notify.error).toHaveBeenCalledWith('An arm cannot lead straight into a join.')
    expect(waiting()).toHaveLength(1)
    expect(useIdeStore.getState().drafts['steps/fetch.ts']).toBeDefined()
  })

  it('keeps the edits on a conflict and drops, by name, one the new version cannot take', async () => {
    const h = harness()
    h.creator.saveNodeFields('hello', (current) => ({ ...current, retries: 5 }))
    h.creator.create({ after: 'fetch' }, 'Audit')
    // The canvas removed `hello` meanwhile; the workspace has not seen it.
    const moved = { ...doc, nodes: doc.nodes.slice(0, 2), edges: doc.edges.slice(0, 1) }
    h.canvasSavedUnseen(moved, 'g-canvas')
    h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-4', 'g-canvas'))

    const outcomes = await h.saver.save([GRAPH_EDITS_KEY])
    expect(outcomes.get(GRAPH_EDITS_KEY)).toBe('graph-conflict')
    pruneGraphOps(useIdeStore.getState, h.loaded(), h.notify)
    expect(waiting().map((entry) => entry.label)).toEqual(['Added “Audit”'])
    expect(useIdeStore.getState().graphConflict?.dropped).toEqual([
      {
        label: 'Changed retries on “Say hello”',
        reason: 'That node is not in this version any more.',
      },
    ])
    expect(h.shown().nodes.map((n) => n.id)).toEqual(['fetch', 'mail', 'new1'])
  })

  it('keeps an edit made while a save is in flight for the next save', async () => {
    const h = harness()
    h.creator.remove('mail')
    let release!: () => void
    h.createVersion.mockImplementationOnce(async (_id, data) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return versionRow(data.ir as ArtifactIR, 'g-after')
    })
    const saving = h.saver.save([GRAPH_EDITS_KEY])
    await vi.waitFor(() => expect(h.createVersion).toHaveBeenCalled())
    h.creator.saveNodeFields('hello', (current) => ({ ...current, retries: 9 }))
    release()
    await saving
    expect(waiting().map((entry) => entry.label)).toEqual(['Changed retries on “Say hello”'])
  })

  it('writes nothing when nothing is pending', async () => {
    const h = harness()
    const outcomes = await h.saver.save([GRAPH_EDITS_KEY])
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(outcomes.size).toBe(0)
  })
})

describe('Discarding pending edits', () => {
  it('discards one edit, closing an added step’s file and its draft', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'One')
    h.creator.remove('mail')
    useIdeStore.getState().setDraft('steps/new1.ts', 'x', null)
    const add = waiting()[0]!
    expect(discardGraphOp(useIdeStore.getState, h.loaded(), add.id)).toEqual([])
    const state = useIdeStore.getState()
    expect(state.openPaths).not.toContain('steps/new1.ts')
    expect(state.drafts['steps/new1.ts']).toBeUndefined()
    expect(waiting().map((entry) => entry.label)).toEqual(['Removed “Send mail”'])
  })

  it('takes a later edit that needed the discarded one with it', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'One')
    h.creator.create({ after: 'new1' }, 'Two')
    const cascaded = discardGraphOp(useIdeStore.getState, h.loaded(), waiting()[0]!.id)
    expect(cascaded.map((entry) => entry.label)).toEqual(['Added “Two”'])
    expect(useIdeStore.getState().graphOps).toEqual([])
  })

  it('brings a removed step’s unsaved code back when the removal is discarded', () => {
    const h = harness()
    useIdeStore.getState().setDraft('steps/mail.ts', MAIL_EDIT, contentHash(MAIL_CODE))
    h.creator.remove('mail')
    discardGraphOp(useIdeStore.getState, h.loaded(), waiting()[0]!.id)
    expect(useIdeStore.getState().drafts['steps/mail.ts']?.source).toBe(MAIL_EDIT)
  })

  it('drops the last edit for ⌘Z, and nothing when none is waiting', () => {
    const h = harness()
    h.creator.remove('mail')
    h.creator.saveNodeFields('hello', (current) => ({ ...current, retries: 2 }))
    const undone = discardLastGraphOp(useIdeStore.getState, h.loaded())
    expect(undone?.discarded.label).toBe('Changed retries on “Say hello”')
    expect(waiting().map((entry) => entry.label)).toEqual(['Removed “Send mail”'])
    discardLastGraphOp(useIdeStore.getState, h.loaded())
    expect(discardLastGraphOp(useIdeStore.getState, h.loaded())).toBeNull()
  })
})

describe('A version saved underneath', () => {
  it('drops an edit that no longer applies with a toast, and keeps the rest', () => {
    const h = harness()
    h.creator.remove('hello')
    h.creator.create({ after: 'fetch' }, 'Audit')
    const moved = { ...doc, nodes: doc.nodes.slice(0, 2), edges: doc.edges.slice(0, 1) }
    h.canvasSaved(moved, 'g-canvas')
    pruneGraphOps(useIdeStore.getState, h.loaded(), h.notify)
    expect(waiting().map((entry) => entry.label)).toEqual(['Added “Audit”'])
    expect(h.notify.error).toHaveBeenCalledWith('An unsaved change no longer applies', {
      description: 'Removed “Say hello”: That node is not in this version any more.',
    })
  })
})

describe('Review fixes: what broke before', () => {
  /** Holds the next post open until `release` is called. */
  function holdNextPost(h: ReturnType<typeof harness>) {
    let release!: () => void
    h.createVersion.mockImplementationOnce(async (_id, data) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return versionRow(data.ir as ArtifactIR, 'g-after')
    })
    return () => release()
  }

  it('can’t discard, ⌘Z or un-add an edit the post in flight carries', async () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'Pending')
    const release = holdNextPost(h)
    const saving = h.saver.save([GRAPH_EDITS_KEY])
    await vi.waitFor(() => expect(h.createVersion).toHaveBeenCalled())
    const [add] = waiting()
    expect(add!.saving).toBe(true)
    expect(discardGraphOp(useIdeStore.getState, h.loaded(), add!.id)).toEqual([])
    expect(discardLastGraphOp(useIdeStore.getState, h.loaded())).toBeNull()
    // Removing it records a real removal rather than un-adding what is being posted.
    h.creator.remove('new1')
    expect(waiting().map((entry) => entry.op.kind)).toEqual(['insert', 'remove'])
    release()
    await saving
    expect(waiting().map((entry) => entry.op.kind)).toEqual(['remove'])
  })

  it('lets an edit be discarded again once its post failed', async () => {
    const h = harness()
    h.creator.remove('mail')
    h.createVersion.mockRejectedValueOnce(new ApiError('Refused.', 400))
    await h.saver.save([GRAPH_EDITS_KEY])
    expect(waiting()[0]!.saving).toBeUndefined()
    expect(discardLastGraphOp(useIdeStore.getState, h.loaded())).not.toBeNull()
  })

  it('does not bring back drafts a cascaded discard cleared', () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'P')
    h.creator.create({ after: 'new1' }, 'Q')
    const store = useIdeStore.getState()
    store.setDraft('steps/new1.ts', 'p code', null)
    store.setDraft('steps/new2.ts', 'q code', null)
    // Q builds on P, so removing P is recorded (P's code is stashed on it).
    h.creator.remove('new1')
    discardGraphOp(useIdeStore.getState, h.loaded(), waiting()[0]!.id)
    expect(useIdeStore.getState().graphOps).toEqual([])
    expect(useIdeStore.getState().drafts).toEqual({})
  })

  it('keeps a second save’s edits on screen while the first save’s refetch never landed', async () => {
    const h = harness()
    h.refresh.mockImplementation(async () => undefined)
    h.creator.remove('mail')
    await h.saver.save([GRAPH_EDITS_KEY])
    h.creator.create({ after: 'hello' }, 'Later')
    await h.saver.save([GRAPH_EDITS_KEY])
    expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
    expect(h.shown().nodes.map((n) => n.id)).toEqual(['fetch', 'hello', 'new1'])
  })

  it('keeps a pending step’s code saveable when an earlier same-named Add is discarded', async () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'Notify')
    h.creator.create({ after: 'hello' }, 'Notify')
    const scaffold = String(h.shown().nodes.find((n) => n.id === 'new2')!.data.code)
    useIdeStore.getState().setDraft('steps/new2.ts', 'typed', contentHash(scaffold))
    // Discarding the first: the second now replays where its name is free.
    discardGraphOp(useIdeStore.getState, h.loaded(), waiting()[0]!.id)
    expect(waiting().map((entry) => entry.label)).toEqual(['Added “Notify”'])
    const outcomes = await h.saver.save(['steps/new2.ts'])
    expect(outcomes.get('steps/new2.ts')).toBe('saved')
  })

  it('closes a dropped Add’s file before the save, and says the graph edits were partly saved', async () => {
    const h = harness()
    h.creator.create({ after: 'hello' }, 'Gone')
    h.creator.remove('fetch')
    useIdeStore.getState().setDraft('steps/new1.ts', 'typed', null)
    // `hello` went on the canvas underneath; the workspace has refetched it.
    const moved = { ...doc, nodes: doc.nodes.slice(0, 2), edges: doc.edges.slice(0, 1) }
    h.canvasSaved(moved, 'g-canvas')
    const outcomes = await h.saver.save(['steps/new1.ts', GRAPH_EDITS_KEY])
    expect(outcomes.get(GRAPH_EDITS_KEY)).toBe('partial')
    expect(outcomes.get('steps/new1.ts')).toBe('unchanged')
    expect(useIdeStore.getState().drafts['steps/new1.ts']).toBeUndefined()
    expect(useIdeStore.getState().openPaths).not.toContain('steps/new1.ts')
    expect(posted(h.createVersion).ir.nodes.map((n) => n.id)).toEqual(['mail'])
  })

  it('keeps the names of dropped edits on the notice when the post is then refused', async () => {
    const h = harness()
    useIdeStore.getState().setGraphConflict({
      currentVersionId: 'v-3',
      currentGraphHash: 'g-3',
      paths: [],
      dropped: [{ label: 'Removed “X”', reason: 'Gone.' }],
    })
    h.creator.remove('mail')
    h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-4', 'g-4'))
    await h.saver.save([GRAPH_EDITS_KEY])
    expect(useIdeStore.getState().graphConflict?.dropped).toEqual([
      { label: 'Removed “X”', reason: 'Gone.' },
    ])
  })

  it('names “your changes”, not the internal key, when only graph edits fail to save', async () => {
    const h = harness()
    h.creator.remove('mail')
    h.createVersion.mockRejectedValueOnce(new ApiError('', 500))
    await h.saver.save([GRAPH_EDITS_KEY])
    expect(h.notify.error).toHaveBeenCalledWith('Couldn’t save the change')
    expect(h.notify.error).not.toHaveBeenCalledWith(expect.stringContaining(':graph'))
  })
})

describe('the pending entry names the arm a step went into', () => {
  it('says which arm of the block, or after it', () => {
    const h = harness()
    const waitDoc: ArtifactIR = {
      ...doc,
      nodes: [
        {
          id: 'w',
          type: 'wait_for_event',
          name: 'Wait',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { eventType: 'sunny', timeout: '30 seconds', onEventNode: 'fetch' },
        },
        doc.nodes[0]!,
      ],
      edges: [{ id: 'e1', source: 'w', target: 'fetch', label: 'onEvent' }],
      entryNodeId: 'w',
    }
    h.canvasSaved(waitDoc, 'g-w')
    h.creator.create({ after: 'w', edgeId: 'e1' }, 'Hello')
    h.creator.create({ after: 'w', arm: 'onTimeout' }, 'Late')
    h.creator.create({ after: 'w', arm: 'then' }, 'Notify')
    expect(waiting().map((entry) => entry.label)).toEqual([
      'Added “Hello” to onEvent of “Wait”',
      'Added “Late” to onTimeout of “Wait”',
      'Added “Notify” after “Wait”',
    ])
  })
})

describe('an inline step', () => {
  it('records the step inline with its scaffold, and opens its file', () => {
    const h = harness()
    const outcome = h.creator.create({ after: 'fetch' }, 'Quick', undefined, {
      type: 'step',
      data: { inline: true },
    })
    expect(outcome).toEqual({ status: 'created', nodeId: 'new1', path: 'steps/new1.ts' })
    const [entry] = waiting()
    expect(entry!.op).toMatchObject({
      kind: 'insert',
      node: { type: 'step', data: { inline: true } },
    })
    const op = entry!.op
    // An inline step holds statements, not a module.
    expect(op.kind === 'insert' && String(op.node.data?.code)).not.toContain('export default')
    expect(h.shown().nodes.find((n) => n.id === 'new1')?.data).toMatchObject({ inline: true })
  })
})

describe('field edits to one node in a row', () => {
  it('merge into one pending entry, which goes once the values are back', () => {
    const h = harness()
    const base = { greeting: 'hi', retries: 1 }
    h.creator.saveNodeFields('hello', () => ({ greeting: 'hey', retries: 1 }))
    h.creator.saveNodeFields('hello', () => ({ greeting: 'hey', retries: 3 }))
    const waitingNow = waiting()
    expect(waitingNow).toHaveLength(1)
    expect(waitingNow[0]!.op).toMatchObject({
      kind: 'fields',
      edited: { greeting: 'hey', retries: 3 },
      base,
    })
    h.creator.saveNodeFields('hello', () => base)
    expect(waiting()).toEqual([])
  })
})

describe('a node edit from the settings panel', () => {
  it('records a new connection and a rename, and goes once both are undone', () => {
    const h = harness()
    h.creator.saveNodeEdit('fetch', (current) => ({
      ...current,
      edges: [...current.edges, { id: 'x1', target: 'hello', label: 'then' }],
    }))
    h.creator.saveNodeEdit('fetch', (current) => ({ ...current, name: 'Fetch it' }))
    const [entry] = waiting()
    expect(waiting()).toHaveLength(1)
    expect(entry!.label).toBe(
      'Renamed “Fetch user” to “Fetch it”; changed the connections of “Fetch user”',
    )
    expect(h.shown().edges.some((e) => e.id === 'x1' && e.source === 'fetch')).toBe(true)
    h.creator.saveNodeEdit('fetch', (current) => ({
      ...current,
      name: 'Fetch user',
      edges: current.edges.filter((e) => e.id !== 'x1'),
    }))
    expect(waiting()).toEqual([])
  })

  it('refuses a connection to a node that isn’t there', () => {
    const h = harness()
    const outcome = h.creator.saveNodeEdit('fetch', (current) => ({
      ...current,
      edges: [...current.edges, { id: 'x1', target: 'ghost' }],
    }))
    expect(outcome).toEqual({
      status: 'refused',
      reason: 'It connects to a node that is not in this version any more.',
    })
    expect(waiting()).toEqual([])
  })
})
