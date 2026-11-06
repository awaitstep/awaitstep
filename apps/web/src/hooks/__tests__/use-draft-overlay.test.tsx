import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SourceFile } from '../../lib/api-client'
import type { Drafts } from '../../lib/ide/drafts'
import { fileOwner } from '../../lib/ide/project'
import { useDraftOverlay } from '../use-draft-overlay'

const baseline = new Map<string, SourceFile>([
  ['lib/a.ts', { path: 'lib/a.ts', source: 'saved', role: 'module', hash: 'ha' }],
])
const saved = new Set(['lib/a.ts'])

describe('useDraftOverlay', () => {
  it('lays drafts over the loaded files and changes nothing else', () => {
    const drafts: Drafts = { 'lib/a.ts': { source: 'mine', baseHash: 'ha' } }
    const { result } = renderHook(() => useDraftOverlay(baseline, drafts, saved))
    expect(result.current.files.get('lib/a.ts')?.source).toBe('mine')
    expect(result.current.ghostPaths).toEqual([])
    expect(result.current.projectPaths).toBe(saved)
  })

  it('keeps a file deleted on the server, with the unsaved text, as an editable project file', () => {
    const drafts: Drafts = { 'lib/gone.ts': { source: 'my copy', baseHash: 'hg' } }
    const { result } = renderHook(() => useDraftOverlay(baseline, drafts, saved))
    expect(result.current.files.get('lib/gone.ts')?.source).toBe('my copy')
    expect(result.current.ghostPaths).toEqual(['lib/gone.ts'])
    const sets = { projectPaths: result.current.projectPaths, storedPaths: saved }
    expect(fileOwner('lib/gone.ts', sets)).toBe('project')
  })

  it('does not rebuild the project paths while the person types in another file', () => {
    let drafts: Drafts = {
      'lib/gone.ts': { source: 'my copy', baseHash: 'hg' },
      'lib/a.ts': { source: 'm', baseHash: 'ha' },
    }
    const { result, rerender } = renderHook(() => useDraftOverlay(baseline, drafts, saved))
    const before = result.current
    drafts = { ...drafts, 'lib/a.ts': { source: 'mm', baseHash: 'ha' } }
    rerender()
    expect(result.current.projectPaths).toBe(before.projectPaths)
    expect(result.current.ghostPaths).toBe(before.ghostPaths)
  })
})
