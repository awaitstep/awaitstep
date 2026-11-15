import { afterEach, describe, expect, it } from 'vitest'
import { isTypingTarget } from '../typing-target'

afterEach(() => {
  document.body.innerHTML = ''
})

function at(html: string): Element {
  document.body.innerHTML = html
  return document.getElementById('t')!
}

describe('isTypingTarget', () => {
  it.each([
    ['a text input', '<input id="t">'],
    ['a textarea', '<textarea id="t"></textarea>'],
    ['a select', '<select id="t"></select>'],
    ['a contenteditable field', '<div contenteditable="true"><span id="t"></span></div>'],
    [
      'Monaco’s EditContext input (a plain div)',
      '<div class="monaco-editor"><div id="t" class="native-edit-context"></div></div>',
    ],
    [
      'Monaco’s find input',
      '<div class="monaco-editor"><div class="find-widget"><textarea id="t"></textarea></div></div>',
    ],
  ])('is true in %s', (_name, html) => {
    expect(isTypingTarget(at(html))).toBe(true)
  })

  it.each([
    ['the canvas pane', '<div class="react-flow__pane" id="t"></div>'],
    ['a button', '<button id="t">Add</button>'],
    ['content marked not editable', '<div contenteditable="false" id="t"></div>'],
  ])('is false on %s', (_name, html) => {
    expect(isTypingTarget(at(html))).toBe(false)
  })

  it('is false without an element', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
  })
})
