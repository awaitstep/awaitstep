import { describe, expect, it } from 'vitest'
import {
  buildFileTree,
  flattenTreeRows,
  focusAfterRemoval,
  treeKeyIntent,
  type TreeKeyEvent,
} from '../ide/file-tree'

const project = buildFileTree([
  { path: 'lib/payments/charge.ts', role: 'module' },
  { path: 'lib/payments/refund.ts', role: 'module' },
  { path: 'package.json', role: 'meta' },
])
const generated = buildFileTree([{ path: 'worker.ts', role: 'entry' }])

function rowsWith(collapsed: string[] = []) {
  return flattenTreeRows(
    [
      { id: 'project', label: 'Project', nodes: project },
      { id: 'generated', label: 'Generated', nodes: generated },
    ],
    new Set(collapsed),
  )
}

const press = (
  rows: ReturnType<typeof rowsWith>,
  from: string,
  key: string,
  ev: Partial<TreeKeyEvent> = {},
) => treeKeyIntent(rows, from, { key, ...ev })

describe('flattenTreeRows', () => {
  it('lists sections and visible entries in order', () => {
    expect(rowsWith().map((r) => r.key)).toEqual([
      'section:project',
      'project:lib',
      'project:lib/payments',
      'project:lib/payments/charge.ts',
      'project:lib/payments/refund.ts',
      'project:package.json',
      'section:generated',
      'generated:worker.ts',
    ])
  })

  it('hides the children of a collapsed folder and section', () => {
    const keys = rowsWith(['project:lib', 'section:generated']).map((r) => r.key)
    expect(keys).toEqual([
      'section:project',
      'project:lib',
      'project:package.json',
      'section:generated',
    ])
  })

  it('keeps force-opened folders open', () => {
    const rows = flattenTreeRows(
      [{ id: 'project', label: 'Project', nodes: project }],
      new Set(['project:lib']),
      {
        forceOpen: new Set(['project:lib']),
      },
    )
    expect(rows.some((r) => r.key === 'project:lib/payments')).toBe(true)
  })

  it('marks only project files as editable', () => {
    const rows = rowsWith()
    expect(rows.find((r) => r.path === 'package.json')?.editable).toBe(true)
    expect(rows.find((r) => r.path === 'worker.ts')?.editable).toBe(false)
    expect(rows.find((r) => r.path === 'lib')?.editable).toBe(false)
  })
})

describe('treeKeyIntent', () => {
  const rows = rowsWith()

  it('moves with the arrows and stops at the ends', () => {
    expect(press(rows, 'project:lib', 'ArrowDown')).toEqual({
      type: 'focus',
      key: 'project:lib/payments',
    })
    expect(press(rows, 'project:lib', 'ArrowUp')).toEqual({ type: 'focus', key: 'section:project' })
    expect(press(rows, 'section:project', 'ArrowUp')).toBeNull()
    expect(press(rows, 'generated:worker.ts', 'ArrowDown')).toBeNull()
    expect(press(rows, 'project:lib', 'End')).toEqual({ type: 'focus', key: 'generated:worker.ts' })
    expect(press(rows, 'project:lib', 'Home')).toEqual({ type: 'focus', key: 'section:project' })
  })

  it('→ opens a closed folder, then steps into it', () => {
    const closed = rowsWith(['project:lib'])
    expect(press(closed, 'project:lib', 'ArrowRight')).toEqual({
      type: 'expand',
      key: 'project:lib',
    })
    expect(press(rows, 'project:lib', 'ArrowRight')).toEqual({
      type: 'focus',
      key: 'project:lib/payments',
    })
    expect(press(rows, 'project:package.json', 'ArrowRight')).toBeNull()
  })

  it('← closes an open folder, then steps to the parent', () => {
    expect(press(rows, 'project:lib', 'ArrowLeft')).toEqual({
      type: 'collapse',
      key: 'project:lib',
    })
    expect(press(rows, 'project:lib/payments/charge.ts', 'ArrowLeft')).toEqual({
      type: 'focus',
      key: 'project:lib/payments',
    })
  })

  it('Enter opens a file and toggles a folder; Space selects', () => {
    expect(press(rows, 'project:package.json', 'Enter')).toEqual({
      type: 'open',
      key: 'project:package.json',
    })
    expect(press(rows, 'project:lib', 'Enter')).toEqual({ type: 'toggle', key: 'project:lib' })
    expect(press(rows, 'project:lib', ' ')).toEqual({ type: 'select', key: 'project:lib' })
    expect(press(rows, 'section:project', ' ')).toBeNull()
  })

  it('F2, Delete, Backspace and the menu keys act on project files only', () => {
    const file = 'project:package.json'
    expect(press(rows, file, 'F2')).toEqual({ type: 'rename', key: file })
    expect(press(rows, file, 'Delete')).toEqual({ type: 'delete', key: file })
    expect(press(rows, file, 'Backspace')).toEqual({ type: 'delete', key: file })
    expect(press(rows, file, 'ContextMenu')).toEqual({ type: 'menu', key: file })
    expect(press(rows, file, 'F10', { shiftKey: true })).toEqual({ type: 'menu', key: file })
    expect(press(rows, file, 'F10')).toBeNull()
    for (const key of ['F2', 'Delete', 'ContextMenu']) {
      expect(press(rows, 'generated:worker.ts', key)).toBeNull()
      expect(press(rows, 'project:lib', key)).toBeNull()
    }
  })

  it('Escape returns to the editor', () => {
    expect(press(rows, 'project:lib', 'Escape')).toEqual({ type: 'escape' })
  })

  it('ignores chords so shortcuts and the browser keep them', () => {
    expect(press(rows, 'project:lib', 'ArrowDown', { metaKey: true })).toBeNull()
    expect(press(rows, 'project:package.json', 'F2', { altKey: true })).toBeNull()
  })
})

describe('focusAfterRemoval', () => {
  const rows = rowsWith()

  it('goes to the next row', () => {
    expect(focusAfterRemoval(rows, 'project:lib/payments/charge.ts')).toBe(
      'project:lib/payments/refund.ts',
    )
  })

  it('goes to the previous row when the removed one was last in its section', () => {
    expect(focusAfterRemoval(rows, 'project:package.json')).toBe('project:lib/payments/refund.ts')
  })

  it('is null for an unknown row', () => {
    expect(focusAfterRemoval(rows, 'project:nope')).toBeNull()
  })
})
