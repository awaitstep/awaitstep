import { afterEach, describe, expect, it, vi } from 'vitest'
import { runKeyBelongsElsewhere, runShortcut } from '../ide/key-ownership'

afterEach(() => {
  document.body.innerHTML = ''
})

function at(html: string): Element {
  document.body.innerHTML = html
  return document.getElementById('t')!
}

describe('runKeyBelongsElsewhere', () => {
  it.each([
    ['the Search box', '<input id="t">'],
    ['a filter select', '<select id="t"></select>'],
    [
      'Monaco’s find input',
      '<div class="monaco-editor"><textarea id="t" class="input"></textarea></div>',
    ],
    ['a contenteditable field', '<div id="t" contenteditable="true"></div>'],
  ])('is true in %s', (_n, html) => {
    expect(runKeyBelongsElsewhere(at(html))).toBe(true)
  })

  it.each([
    [
      'the editor’s text area',
      '<div class="monaco-editor"><textarea id="t" class="inputarea"></textarea></div>',
    ],
    ['the results list', '<div id="t" tabindex="0"></div>'],
    ['the trigger payload box', '<textarea id="t" data-ide-run-field=""></textarea>'],
  ])('is false in %s', (_n, html) => {
    expect(runKeyBelongsElsewhere(at(html))).toBe(false)
  })

  it('is true anywhere while Monaco’s find widget is visible, false when it is hidden', () => {
    document.body.innerHTML = '<div class="find-widget visible"></div><div id="t"></div>'
    expect(runKeyBelongsElsewhere(document.getElementById('t'))).toBe(true)
    document.querySelector('.find-widget')!.className = 'find-widget'
    expect(runKeyBelongsElsewhere(document.getElementById('t'))).toBe(false)
  })
})

describe('runShortcut', () => {
  it('declines without running when the key belongs elsewhere', () => {
    const run = vi.fn()
    const event = new KeyboardEvent('keydown')
    Object.defineProperty(event, 'target', { value: at('<input id="t">') })
    expect(runShortcut(run)(event)).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})
