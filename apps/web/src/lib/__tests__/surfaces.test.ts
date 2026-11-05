import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SURFACE,
  editorSearch,
  parseEditorSearch,
  parseSurface,
  surfaceSwitchTarget,
  unsavedDialogCopy,
  WORKSPACE_SURFACES,
} from '../workflows/surfaces'

const EDITOR = '/workflows/wf-1/editor'

function at(pathname: string, search: Record<string, unknown> = {}) {
  return { pathname, search }
}

describe('surfaceSwitchTarget', () => {
  it('recognises a view change within the same editor', () => {
    expect(
      surfaceSwitchTarget({
        current: at(EDITOR, { view: 'canvas' }),
        next: at(EDITOR, { view: 'ide' }),
      }),
    ).toBe('ide')
    expect(
      surfaceSwitchTarget({
        current: at(EDITOR, { view: 'ide', version: 'v-1' }),
        next: at(EDITOR, { view: 'canvas', version: 'v-1' }),
      }),
    ).toBe('canvas')
  })

  it('treats a missing view as the default canvas view', () => {
    expect(surfaceSwitchTarget({ current: at(EDITOR), next: at(EDITOR, { view: 'ide' }) })).toBe(
      'ide',
    )
    expect(surfaceSwitchTarget({ current: at(EDITOR, { view: 'ide' }), next: at(EDITOR) })).toBe(
      'canvas',
    )
  })

  it('ignores a trailing slash on either side', () => {
    expect(
      surfaceSwitchTarget({
        current: at(EDITOR, { view: 'ide' }),
        next: at(`${EDITOR}/`, { view: 'canvas' }),
      }),
    ).toBe('canvas')
  })

  it('is not a switch when the destination leaves the editor', () => {
    // The whole point of the distinction: these are departures — Back
    // included — and get the departure wording rather than "the other
    // surface opens the saved version", which would be nonsense here.
    for (const pathname of [
      '/workflows',
      '/workflows/wf-1',
      '/workflows/wf-1/runs',
      '/workflows/wf-1/deployments',
      '/dashboard',
    ]) {
      expect(
        surfaceSwitchTarget({ current: at(EDITOR, { view: 'ide' }), next: at(pathname) }),
      ).toBe(null)
    }
  })

  it('is not a switch when another workflow opens in the other view', () => {
    // Leaving this workflow's work behind, so it must not be worded as
    // staying put.
    expect(
      surfaceSwitchTarget({
        current: at(EDITOR, { view: 'ide' }),
        next: at('/workflows/wf-2/editor', { view: 'canvas' }),
      }),
    ).toBe(null)
  })

  it('is not a switch when the view stays the same', () => {
    // e.g. "back to latest": same view, different version.
    expect(
      surfaceSwitchTarget({
        current: at(EDITOR, { view: 'canvas', version: 'v-1' }),
        next: at(EDITOR, { view: 'canvas' }),
      }),
    ).toBe(null)
  })
})

describe('parseSurface', () => {
  it('accepts the two views and defaults anything else to canvas', () => {
    expect(parseSurface('ide')).toBe('ide')
    expect(parseSurface('canvas')).toBe('canvas')
    for (const value of [undefined, null, '', 'code', 'IDE', 1]) {
      expect(parseSurface(value)).toBe(DEFAULT_SURFACE)
    }
    expect(DEFAULT_SURFACE).toBe('canvas')
  })
})

describe('editorSearch with a node', () => {
  it('carries the node to open on the canvas, and drops it when not given', () => {
    expect(editorSearch('canvas', { version: 'v-2', node: 'n1' })).toEqual({
      view: 'canvas',
      version: 'v-2',
      node: 'n1',
    })
    expect(editorSearch('canvas', { node: undefined })).toEqual({ view: 'canvas' })
  })

  it('reads ?node= from the URL, ignoring anything that is not a non-empty string', () => {
    expect(parseEditorSearch({ view: 'canvas', node: 'n1' }).node).toBe('n1')
    expect(parseEditorSearch({ node: '' }).node).toBeUndefined()
    expect(parseEditorSearch({ node: 7 }).node).toBeUndefined()
    expect(parseEditorSearch({}).node).toBeUndefined()
  })
})

describe('editorSearch', () => {
  it('carries only the params it is given', () => {
    expect(editorSearch('ide')).toEqual({ view: 'ide' })
    expect(editorSearch('canvas', { version: undefined })).toEqual({ view: 'canvas' })
    expect(editorSearch('ide', { version: 'v-1', file: 'src/a.ts' })).toEqual({
      view: 'ide',
      version: 'v-1',
      file: 'src/a.ts',
    })
  })
})

describe('unsavedDialogCopy', () => {
  const unsaved = 'Two files have unsaved changes.'

  it('offers saving first when switching surface', () => {
    const copy = unsavedDialogCopy({ to: 'canvas', unsaved, canSave: true })
    expect(copy.confirmLabel).toBe('Save and switch')
    expect(copy.secondaryLabel).toBe('Switch without saving')
    // Not a warning: the primary action keeps the work.
    expect(copy.variant).toBe('default')
  })

  it('says what is unsaved and what the other surface will show', () => {
    const copy = unsavedDialogCopy({ to: 'ide', unsaved, canSave: true })
    expect(copy.description).toContain(unsaved)
    expect(copy.description).toContain('last saved version')
    expect(copy.title).toContain('Code')
  })

  it('always says the work is lost, on every branch', () => {
    // Both surfaces tear down their unsaved state on unmount, so going
    // without saving really does discard it. Saying only that the changes
    // "will not appear" on the other side — as an earlier version did —
    // reads as if they were still safely somewhere.
    for (const to of [...WORKSPACE_SURFACES, null]) {
      for (const canSave of [true, false]) {
        const copy = unsavedDialogCopy({ to, unsaved, canSave })
        expect(copy.description).toMatch(/lost|discard/i)
      }
    }
  })

  it('never frames a switch as leaving', () => {
    for (const to of WORKSPACE_SURFACES) {
      const copy = unsavedDialogCopy({ to, unsaved, canSave: true })
      expect(`${copy.title} ${copy.confirmLabel}`).not.toMatch(/leav/i)
    }
  })

  it('drops the save offer when this version cannot be saved over', () => {
    const copy = unsavedDialogCopy({ to: 'canvas', unsaved, canSave: false })
    expect(copy.confirmLabel).toBe('Open Canvas')
    expect(copy.secondaryLabel).toBeUndefined()
    expect(copy.variant).toBe('warning')
  })

  it('warns about loss when the navigation really is a departure', () => {
    const copy = unsavedDialogCopy({ to: null, unsaved, canSave: true })
    expect(copy.title).toBe('Unsaved changes')
    expect(copy.description).toContain('lost if you leave')
    expect(copy.confirmLabel).toBe('Leave')
    expect(copy.secondaryLabel).toBeUndefined()
    expect(copy.variant).toBe('warning')
  })
})

describe('parseEditorSearch', () => {
  it('reads every editor param from either route, and drops what it doesn’t know', () => {
    expect(
      parseEditorSearch({ view: 'ide', version: 'v-1', file: 'a.ts', kind: 'script', x: 1 }),
    ).toEqual({ view: 'ide', version: 'v-1', file: 'a.ts', kind: 'script' })
    expect(parseEditorSearch({ template: '1' })).toEqual({ view: DEFAULT_SURFACE, template: true })
    expect(parseEditorSearch({ view: 'nope', kind: 'other', version: 3 })).toEqual({
      view: DEFAULT_SURFACE,
    })
  })
})
