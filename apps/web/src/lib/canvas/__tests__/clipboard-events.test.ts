// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { copyOnCanvas, pasteOnCanvas, type CanvasClipboard } from '../clipboard-events'

/** A copy or paste event fired at `target`, with a clipboard holding `text`. */
function clipboardEvent(target: Element, text = '') {
  const data = new Map<string, string>([['text/plain', text]])
  const e = {
    target,
    clipboardData: {
      getData: (type: string) => data.get(type) ?? '',
      setData: (type: string, value: string) => void data.set(type, value),
    },
    preventDefault: vi.fn(),
  }
  return { e: e as unknown as ClipboardEvent, data, preventDefault: e.preventDefault }
}

function canvasWith(overrides: Partial<CanvasClipboard> = {}): CanvasClipboard {
  return {
    copySelection: () => '{"nodes":"copied"}',
    paste: () => ['n_new'],
    readOnly: false,
    ...overrides,
  }
}

function element(html: string, selector: string): Element {
  document.body.innerHTML = html
  return document.querySelector(selector)!
}

const PANE = '<div class="react-flow__pane"><div id="t"></div></div>'

describe('copyOnCanvas', () => {
  it('puts the selected nodes on the clipboard instead of the browser’s copy', () => {
    const { e, data, preventDefault } = clipboardEvent(element(PANE, '#t'))
    expect(copyOnCanvas(e, canvasWith(), '')).toBe('{"nodes":"copied"}')
    expect(data.get('text/plain')).toBe('{"nodes":"copied"}')
    expect(preventDefault).toHaveBeenCalled()
  })

  it.each([
    ['with no node selected', PANE, '', { copySelection: () => null }],
    ['in a field', '<input id="t" />', '', {}],
    ['in a dialog', '<div role="dialog"><button id="t"></button></div>', '', {}],
    ['with page text selected', PANE, 'some text', {}],
  ])('leaves the browser’s copy alone %s', (_, html, selected, overrides) => {
    const { e, preventDefault } = clipboardEvent(element(html, '#t'))
    expect(copyOnCanvas(e, canvasWith(overrides), selected)).toBeNull()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})

describe('pasteOnCanvas', () => {
  it('pastes copied nodes from the clipboard', () => {
    const paste = vi.fn(() => ['n_new'])
    const { e, preventDefault } = clipboardEvent(element(PANE, '#t'), '{"copied":true}')
    expect(pasteOnCanvas(e, canvasWith({ paste }))).toEqual(['n_new'])
    expect(paste).toHaveBeenCalledWith('{"copied":true}')
    expect(preventDefault).toHaveBeenCalled()
  })

  it.each([
    ['text that holds no nodes', PANE, { paste: () => [] }],
    ['on a read-only canvas', PANE, { readOnly: true }],
    ['in a field', '<textarea id="t"></textarea>', {}],
    ['in the code editor', '<div class="monaco-editor"><div id="t"></div></div>', {}],
  ])('leaves the browser’s paste alone for %s', (_, html, overrides) => {
    const { e, preventDefault } = clipboardEvent(element(html, '#t'), 'hello')
    expect(pasteOnCanvas(e, canvasWith(overrides))).toEqual([])
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
