import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contentHash, type ArtifactIR } from '@awaitstep/ir'
import { ApiError, VersionConflictError, type SavedVersion } from '../api-client'
import { loadVersionDocument } from '../ide/node-source'
import { createStepSaver, type StepSaveDeps } from '../ide/step-save'
import { useIdeStore } from '../../stores/ide-store'

const metadata = { name: 'orders', version: 3, createdAt: 't', updatedAt: 't' }
/** A step's code as the Code view shows it: the module, which is what a draft's base hash is taken from. */
const asModule = (fn: string, body: string) =>
  `export default async function ${fn}({ env, event, inputs, step, ctx }) {\n  ${body}\n}\n`
const VALIDATE_CODE = asModule('Validate', 'return 1')
const CHARGE_CODE = asModule('Charge', 'return 2')
const doc: ArtifactIR = {
  kind: 'workflow',
  metadata,
  nodes: [
    {
      id: 'validate',
      type: 'step',
      name: 'Validate',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: VALIDATE_CODE },
    },
    {
      id: 'charge',
      type: 'step',
      name: 'Charge',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: CHARGE_CODE },
    },
    {
      id: 'nap',
      type: 'sleep',
      name: 'Nap',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { duration: '1 minute' },
    },
  ],
  edges: [
    { id: 'e1', source: 'validate', target: 'charge' },
    { id: 'e2', source: 'charge', target: 'nap' },
  ],
  entryNodeId: 'validate',
  trigger: { type: 'http' },
  runtime: {
    env: [{ name: 'KEY', secret: true }],
    files: [{ path: 'lib/x.ts', source: 'export const x = 1' }],
    triggerCode: 'legacy',
  },
}
const VALIDATE = 'steps/validate.ts'
const CHARGE = 'steps/charge.ts'

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

/** The document with one step's code replaced. */
function withCode(ir: ArtifactIR, id: string, code: string): ArtifactIR {
  return { ...ir, nodes: ir.nodes.map((n) => (n.id === id ? { ...n, data: { code } } : n)) }
}

interface Harness {
  deps: StepSaveDeps
  createVersion: ReturnType<typeof vi.fn>
  notify: { error: ReturnType<typeof vi.fn> }
  refresh: ReturnType<typeof vi.fn>
  /** When set, the refetch after a save does not move what the workspace shows. */
  refetchFails: boolean
  /** A version saved elsewhere that the workspace has refetched: the server and the cache both show it. */
  show(ir: ArtifactIR, graphHash: string): void
}

/**
 * The saver's surroundings: a server whose latest version the saver's own
 * posts move, a query cache (`full`) that a refetch copies the server into,
 * and the session store. `readVersion` is swapped by one test to throw.
 */
function harness(initial: ArtifactIR = doc, graphHash = 'g-3', isCurrent = () => true): Harness {
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
  const notify = { error: vi.fn() }
  const refresh = vi.fn(async () => {
    if (!h.refetchFails) full = server
  })
  const deps: StepSaveDeps = {
    workflowId: 'wf-1',
    client: { createVersion },
    notify,
    getStore: useIdeStore.getState,
    isCurrent,
    getVersion: () => loadVersionDocument(full),
    refresh,
  }
  return Object.assign(h, {
    deps,
    createVersion,
    notify,
    refresh,
    show(ir: ArtifactIR, hash: string) {
      server = { version: versionRow(ir, hash), graphHash: hash }
      full = server
    },
  }) as Harness
}

/** The document the save posted, parsed. */
function posted(createVersion: ReturnType<typeof vi.fn>, call = 0) {
  return createVersion.mock.calls[call]![1] as { ir: ArtifactIR; baseGraphHash?: string }
}

function codeOf(ir: ArtifactIR, id: string) {
  return ir.nodes.find((n) => n.id === id)!.data.code
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('createStepSaver', () => {
  it('keeps what was typed while a body-shaped draft was being saved', async () => {
    // Security review round 1 (L2): the saver rewrote the draft to the stored
    // module after the post, over text typed in the meantime.
    useIdeStore.getState().setDraft(VALIDATE, 'return 10', contentHash(VALIDATE_CODE))
    const h = harness()
    h.createVersion.mockImplementationOnce(async (_id: string, data: { ir: unknown }) => {
      useIdeStore.getState().setDraft(VALIDATE, 'return 77', null)
      return versionRow(data.ir as ArtifactIR, 'g-typed')
    })
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('saved')
    expect(useIdeStore.getState().drafts[VALIDATE]).toEqual({
      source: 'return 77',
      baseHash: contentHash(asModule('Validate', 'return 10')),
    })
  })

  it('saves a body typed in place of the module as the module, and shows the draft as saved', async () => {
    // Review round 1: the server wraps a body on save; rebasing the draft on
    // the body's own hash made the next save a false conflict.
    useIdeStore.getState().setDraft(VALIDATE, 'return 10', contentHash(VALIDATE_CODE))
    const h = harness()
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('saved')
    expect(codeOf(posted(h.createVersion).ir, 'validate')).toBe(asModule('Validate', 'return 10'))
    expect(useIdeStore.getState().drafts[VALIDATE]).toEqual({
      source: asModule('Validate', 'return 10'),
      baseHash: contentHash(asModule('Validate', 'return 10')),
    })
    const again = await createStepSaver(h.deps).save([VALIDATE])
    expect(again.get(VALIDATE)).toBe('unchanged')
  })

  it('posts the loaded document with the edited bodies written in, on its graph hash, and nothing else changed', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])

    expect(outcomes.get(VALIDATE)).toBe('saved')
    const { ir, baseGraphHash } = posted(h.createVersion)
    expect(baseGraphHash).toBe('g-3')
    expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 10'))
    expect(codeOf(ir, 'charge')).toBe(CHARGE_CODE)
    // Everything but the body and the file snapshot comes through as loaded.
    expect(ir.runtime).toEqual({ env: doc.runtime!.env, triggerCode: 'legacy' })
    expect(ir.metadata).toEqual(metadata)
    expect(ir.edges).toEqual(doc.edges)
    expect(ir.trigger).toEqual(doc.trigger)
    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.notify.error).not.toHaveBeenCalled()
  })

  it('rebases each saved draft onto the hash of its new code, so the refetch finds it clean', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    await createStepSaver(h.deps).save([VALIDATE])
    expect(useIdeStore.getState().drafts[VALIDATE]).toEqual({
      source: asModule('Validate', 'return 10'),
      baseHash: contentHash(asModule('Validate', 'return 10')),
    })
  })

  it('saves several step drafts as one version', async () => {
    const store = useIdeStore.getState()
    store.setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    store.setDraft(CHARGE, asModule('Charge', 'return 20'), contentHash(CHARGE_CODE))
    const h = harness()
    const outcomes = await createStepSaver(h.deps).save([VALIDATE, CHARGE])
    expect([...outcomes.values()]).toEqual(['saved', 'saved'])
    expect(h.createVersion).toHaveBeenCalledTimes(1)
    const { ir } = posted(h.createVersion)
    expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 10'))
    expect(codeOf(ir, 'charge')).toBe(asModule('Charge', 'return 20'))
  })

  it('refuses a draft whose node code moved since the edit began, marks it, and posts the rest', async () => {
    const store = useIdeStore.getState()
    store.setDraft(VALIDATE, asModule('Validate', 'return 10'), 'stale-hash')
    store.setDraft(CHARGE, asModule('Charge', 'return 20'), contentHash(CHARGE_CODE))
    const h = harness()
    const outcomes = await createStepSaver(h.deps).save([VALIDATE, CHARGE])
    expect(outcomes.get(VALIDATE)).toBe('conflict')
    expect(outcomes.get(CHARGE)).toBe('saved')
    expect(useIdeStore.getState().conflicts[VALIDATE]).toEqual({
      currentHash: contentHash(VALIDATE_CODE),
    })
    expect(codeOf(posted(h.createVersion).ir, 'validate')).toBe(VALIDATE_CODE)
    expect(useIdeStore.getState().drafts[VALIDATE]?.baseHash).toBe('stale-hash')
  })

  it('posts nothing when every draft is refused, unchanged or deleted', async () => {
    const store = useIdeStore.getState()
    store.setDraft(VALIDATE, asModule('Validate', 'return 1'), contentHash(VALIDATE_CODE)) // typed back
    store.setDraft(CHARGE, 'x', 'stale')
    store.setDraft('steps/gone.ts', 'orphan', 'h-gone')
    const h = harness()
    const outcomes = await createStepSaver(h.deps).save([
      VALIDATE,
      CHARGE,
      'steps/gone.ts',
      'steps/none.ts',
    ])
    expect(outcomes.get(VALIDATE)).toBe('unchanged')
    expect(outcomes.get(CHARGE)).toBe('conflict')
    expect(outcomes.get('steps/gone.ts')).toBe('deleted')
    expect(outcomes.get('steps/none.ts')).toBe('unchanged')
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
    expect(useIdeStore.getState().drafts[VALIDATE]).toBeUndefined()
    expect(useIdeStore.getState().drafts['steps/gone.ts']?.source).toBe('orphan')
  })

  it('a refused version (the canvas saved meanwhile) keeps every draft, records the conflict and refetches', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    h.createVersion.mockRejectedValueOnce(
      new VersionConflictError('This workflow changed since it was loaded', 'v-4', 'g-4'),
    )
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('graph-conflict')
    expect(useIdeStore.getState().graphConflict).toEqual({
      currentVersionId: 'v-4',
      currentGraphHash: 'g-4',
      paths: [VALIDATE],
    })
    expect(useIdeStore.getState().drafts[VALIDATE]).toEqual({
      source: asModule('Validate', 'return 10'),
      baseHash: contentHash(VALIDATE_CODE),
    })
    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.notify.error).not.toHaveBeenCalled()
  })

  it('a successful save clears an earlier graph conflict', async () => {
    useIdeStore
      .getState()
      .setGraphConflict({ currentVersionId: 'v-4', currentGraphHash: 'g-4', paths: [VALIDATE] })
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    await createStepSaver(h.deps).save([VALIDATE])
    expect(useIdeStore.getState().graphConflict).toBeNull()
  })

  it('any other failure is one toast with the server’s reason, drafts kept, nothing refetched', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    h.createVersion.mockRejectedValueOnce(
      new ApiError('Invalid IR: nodes.0.data', 422, { hasReason: true }),
    )
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('failed')
    expect(h.notify.error).toHaveBeenCalledWith('Invalid IR: nodes.0.data')
    expect(h.refresh).not.toHaveBeenCalled()
    expect(useIdeStore.getState().drafts[VALIDATE]?.baseHash).toBe(contentHash(VALIDATE_CODE))
  })

  it('refuses to save when the version cannot be read as a document, and says what to do', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    h.deps.getVersion = () => null
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('failed')
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(h.notify.error).toHaveBeenCalledWith(
      'Couldn’t save validate.ts',
      expect.objectContaining({ description: expect.stringContaining('on the canvas') }),
    )
  })

  it('a post in flight when the workspace moves on still lands, but leaves the session alone', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    let current = true
    const h = harness(doc, 'g-3', () => current)
    let finish: (v: SavedVersion) => void = () => {}
    h.createVersion.mockImplementationOnce(
      () => new Promise<SavedVersion>((resolve) => (finish = resolve)),
    )
    const saving = createStepSaver(h.deps).save([VALIDATE])
    current = false
    finish(versionRow(posted(h.createVersion).ir, 'g-after'))
    expect((await saving).get(VALIDATE)).toBe('saved')
    expect(useIdeStore.getState().drafts[VALIDATE]?.baseHash).toBe(contentHash(VALIDATE_CODE))
    expect(useIdeStore.getState().graphConflict).toBeNull()
  })

  it('posts nothing once the workspace has moved on: the store holds another workflow’s drafts', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness(doc, 'g-3', () => false)
    const outcomes = await createStepSaver(h.deps).save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('failed')
    expect(h.createVersion).not.toHaveBeenCalled()
    expect(h.notify.error).not.toHaveBeenCalled()
  })

  it('reports every path failed, with a toast, when something unexpected throws, and keeps taking saves', async () => {
    useIdeStore
      .getState()
      .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
    const h = harness()
    const read = h.deps.getVersion
    let explode = true
    h.deps.getVersion = () => {
      if (explode) throw new Error('cache exploded')
      return read()
    }
    const saver = createStepSaver(h.deps)
    const outcomes = await saver.save([VALIDATE])
    expect(outcomes.get(VALIDATE)).toBe('failed')
    expect(h.notify.error).toHaveBeenCalledWith('Couldn’t save validate.ts')
    explode = false
    expect((await saver.save([VALIDATE])).get(VALIDATE)).toBe('saved')
  })

  describe('single flight', () => {
    it('merges saves that arrive while one is in flight into one following post, built on the response', async () => {
      const store = useIdeStore.getState()
      store.setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      h.refetchFails = true
      let finish: (v: SavedVersion) => void = () => {}
      h.createVersion.mockImplementationOnce(
        () => new Promise<SavedVersion>((resolve) => (finish = resolve)),
      )
      const saver = createStepSaver(h.deps)
      const first = saver.save([VALIDATE])
      // Two more saves while the first is still being written: one post for both.
      store.setDraft(CHARGE, asModule('Charge', 'return 20'), contentHash(CHARGE_CODE))
      const second = saver.save([CHARGE])
      store.setDraft(VALIDATE, asModule('Validate', 'return 11'), contentHash(VALIDATE_CODE))
      const third = saver.save([VALIDATE])
      expect(h.createVersion).toHaveBeenCalledTimes(1)

      const firstDoc = posted(h.createVersion).ir
      finish(versionRow(firstDoc, 'g-after-g-3'))
      expect(await first).toEqual(new Map([[VALIDATE, 'saved']]))
      const merged = await second
      expect(await third).toBe(merged)
      expect(h.createVersion).toHaveBeenCalledTimes(2)
      // The follow-up builds on the first response (the workspace still shows g-3).
      const { ir, baseGraphHash } = posted(h.createVersion, 1)
      expect(baseGraphHash).toBe('g-after-g-3')
      expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 11'))
      expect(codeOf(ir, 'charge')).toBe(asModule('Charge', 'return 20'))
      expect(merged.get(CHARGE)).toBe('saved')
      expect(merged.get(VALIDATE)).toBe('saved')
    })

    it('builds on the refetched version once the workspace shows it', async () => {
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      const saver = createStepSaver(h.deps)
      await saver.save([VALIDATE])
      // The refetch landed and found the draft clean; then the canvas saved
      // over that version, changing another step.
      useIdeStore.getState().clearDraft(VALIDATE)
      h.show(
        withCode(posted(h.createVersion).ir, 'charge', asModule('Charge', 'return 99')),
        'g-canvas',
      )
      useIdeStore
        .getState()
        .setDraft(
          VALIDATE,
          asModule('Validate', 'return 12'),
          contentHash(asModule('Validate', 'return 10')),
        )
      await saver.save([VALIDATE])
      const { ir, baseGraphHash } = posted(h.createVersion, 1)
      expect(baseGraphHash).toBe('g-canvas')
      expect(codeOf(ir, 'charge')).toBe(asModule('Charge', 'return 99'))
      expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 12'))
    })

    it('judges a draft against the document it patches, so a save right after a save is not a false conflict', async () => {
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      h.refetchFails = true
      const saver = createStepSaver(h.deps)
      await saver.save([VALIDATE])
      // No refetch has landed: the workspace still shows g-3 with `return 1`,
      // while the draft was rebased onto `return 10`. Typing on and saving
      // must go through on the response, not be refused against the stale base.
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10;'), contentHash(VALIDATE_CODE))
      const outcomes = await saver.save([VALIDATE])
      expect(outcomes.get(VALIDATE)).toBe('saved')
      expect(useIdeStore.getState().conflicts[VALIDATE]).toBeUndefined()
      const { ir, baseGraphHash } = posted(h.createVersion, 1)
      expect(baseGraphHash).toBe('g-after-g-3')
      expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 10;'))
    })

    it('forgets its own response once the refetch has landed, so a graph that returns to an earlier hash is read as it is', async () => {
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      const saver = createStepSaver(h.deps)
      await saver.save([VALIDATE])
      useIdeStore.getState().clearDraft(VALIDATE)
      // A revert brought the old content back: a new version, the old hash.
      h.show(doc, 'g-3')
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 12'), contentHash(VALIDATE_CODE))
      const outcomes = await saver.save([VALIDATE])
      expect(outcomes.get(VALIDATE)).toBe('saved')
      expect(useIdeStore.getState().conflicts[VALIDATE]).toBeUndefined()
      const { ir, baseGraphHash } = posted(h.createVersion, 1)
      expect(baseGraphHash).toBe('g-3')
      expect(codeOf(ir, 'validate')).toBe(asModule('Validate', 'return 12'))
    })

    it('forgets its own response the moment the workspace shows anything past the base, even when the refetch after the save had failed', async () => {
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      h.refetchFails = true
      const saver = createStepSaver(h.deps)
      await saver.save([VALIDATE])
      useIdeStore.getState().clearDraft(VALIDATE)
      h.refetchFails = false
      // A later poll lands on a canvas save; later still the canvas saves the
      // original graph back, so the cache carries the old base's hash again.
      h.show(withCode(doc, 'charge', asModule('Charge', 'return 99')), 'g-x')
      useIdeStore
        .getState()
        .setDraft(
          CHARGE,
          asModule('Charge', 'return 100'),
          contentHash(asModule('Charge', 'return 99')),
        )
      expect((await saver.save([CHARGE])).get(CHARGE)).toBe('saved')
      expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-x')
      useIdeStore.getState().clearDraft(CHARGE)
      h.show(doc, 'g-3')
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 13'), contentHash(VALIDATE_CODE))
      expect((await saver.save([VALIDATE])).get(VALIDATE)).toBe('saved')
      expect(posted(h.createVersion, 2).baseGraphHash).toBe('g-3')
    })

    it('drops its remembered response after a refused version, so a stuck workspace cannot loop on the same stale base', async () => {
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      h.refetchFails = true
      const saver = createStepSaver(h.deps)
      await saver.save([VALIDATE])
      // The refetch never moved the cache (still g-3), so the response is the base…
      useIdeStore
        .getState()
        .setDraft(VALIDATE, asModule('Validate', 'return 11'), contentHash(VALIDATE_CODE))
      h.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v-9', 'g-9'))
      expect((await saver.save([VALIDATE])).get(VALIDATE)).toBe('graph-conflict')
      expect(posted(h.createVersion, 1).baseGraphHash).toBe('g-after-g-3')
      // …until the server said no. The workspace still shows g-3 with `return 1`,
      // which the draft (built on `return 10`) does not match: a conflict for
      // the person to look at, not another post on the base the server refused.
      expect((await saver.save([VALIDATE])).get(VALIDATE)).toBe('conflict')
      expect(h.createVersion).toHaveBeenCalledTimes(2)
    })

    it('a draft typed on while its save was in flight stays dirty on the new base', async () => {
      const store = useIdeStore.getState()
      store.setDraft(VALIDATE, asModule('Validate', 'return 10'), contentHash(VALIDATE_CODE))
      const h = harness()
      let finish: (v: SavedVersion) => void = () => {}
      h.createVersion.mockImplementationOnce(
        () => new Promise<SavedVersion>((resolve) => (finish = resolve)),
      )
      const saving = createStepSaver(h.deps).save([VALIDATE])
      store.setDraft(VALIDATE, 'return 10 // more', contentHash(VALIDATE_CODE))
      finish(versionRow(posted(h.createVersion).ir, 'g-after'))
      await saving
      expect(useIdeStore.getState().drafts[VALIDATE]).toEqual({
        source: 'return 10 // more',
        baseHash: contentHash(asModule('Validate', 'return 10')),
      })
    })
  })
})
