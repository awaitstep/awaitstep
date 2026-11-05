import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import { runSearch } from '../../lib/ide/search'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'
import { useSearchActions } from '../use-search-actions'

const source = 'needle one\nneedle two'
const files = new Map<string, GeneratedFile>([['a.ts', { path: 'a.ts', source, role: 'module' }]])

function keyFrom(target: Element) {
  const { result } = renderHook(() => useSearchActions(files))
  const event = new KeyboardEvent('keydown', { key: 'F4', bubbles: true })
  Object.defineProperty(event, 'target', { value: target })
  return result.current.nextSearchHitKey(event)
}

beforeEach(() => {
  useIdeSearchStore.getState().reset()
  useIdeStore.getState().resetSession()
  const outcome = runSearch([{ path: 'a.ts', source, generated: false }], {
    query: 'needle',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  })
  useIdeSearchStore.getState().setOutcome(outcome)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('F4 key handling by focus', () => {
  it.each([
    ['the Search box', '<input id="t">'],
    [
      'Monaco’s find input',
      '<div class="monaco-editor"><textarea id="t" class="input"></textarea></div>',
    ],
    [
      'Monaco’s rename input',
      '<div class="monaco-editor"><input id="t" class="rename-input"></div>',
    ],
    ['a contenteditable field', '<div id="t" contenteditable="true"></div>'],
  ])('declines in %s so the match is not selected under the cursor', (_name, html) => {
    document.body.innerHTML = html
    expect(keyFrom(document.getElementById('t')!)).toBe(false)
    expect(useIdeStore.getState().reveal).toBeNull()
  })

  it.each([
    [
      'the editor’s text area',
      '<div class="monaco-editor"><textarea id="t" class="inputarea"></textarea></div>',
    ],
    ['the results list', '<div id="t" role="treeitem" tabindex="0"></div>'],
    ['the page', '<div id="t"></div>'],
  ])('steps to the next hit from %s', (_name, html) => {
    document.body.innerHTML = html
    expect(keyFrom(document.getElementById('t')!)).toBeUndefined()
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'a.ts', line: 1 })
  })
})
