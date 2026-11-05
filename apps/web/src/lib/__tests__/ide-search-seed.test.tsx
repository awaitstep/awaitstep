import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorSearchSeed, findInFiles } from '../ide/search-actions'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'

beforeEach(() => {
  useIdeSearchStore.getState().reset()
  useIdeStore.getState().resetSession()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('editorSearchSeed', () => {
  it('reads the selection without editor focus when the palette holds the keyboard', () => {
    // A focused editor answers; an unfocused one only when asked to ignore focus.
    useIdeStore.getState().setEditorHandle({
      focus: vi.fn(),
      trigger: vi.fn(),
      searchSeed: (ignoreFocus) => (ignoreFocus ? 'chargeOrder' : null),
    })
    expect(editorSearchSeed()).toBeNull()
    document.body.innerHTML = '<div role="dialog"><input id="cmd"></div>'
    document.getElementById('cmd')!.focus()
    expect(editorSearchSeed()).toBe('chargeOrder')
    findInFiles(editorSearchSeed())
    expect(useIdeSearchStore.getState().query).toBe('chargeOrder')
  })
})
