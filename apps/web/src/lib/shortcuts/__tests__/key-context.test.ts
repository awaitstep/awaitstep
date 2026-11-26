import { describe, expect, it } from 'vitest'
import { keyContext } from '../key-context'

/** A stand-in element: `closest` answers for the selectors it sits inside. */
function inside(...selectors: string[]): EventTarget {
  return {
    closest: (query: string) =>
      query.split(',').some((part) => selectors.includes(part.trim())) ? {} : null,
  } as unknown as EventTarget
}

function page(openLayer: string | null = null): ParentNode {
  return {
    querySelector: (query: string) =>
      openLayer && query.split(',').some((part) => part.trim() === openLayer) ? {} : null,
  } as unknown as ParentNode
}

describe('keyContext', () => {
  it.each([
    ['a plain page', inside(), page(), { typing: false, inDialog: false }],
    ['a text field', inside('input'), page(), { typing: true, inDialog: false }],
    [
      'a select’s trigger, which types ahead',
      inside('[role="combobox"]'),
      page(),
      { typing: true, inDialog: false },
    ],
    ['an open menu', inside('[role="menu"]'), page(), { typing: false, inDialog: true }],
    ['a select’s list', inside('[role="listbox"]'), page(), { typing: false, inDialog: true }],
    [
      'a canvas panel with its own Esc',
      inside('[data-own-keys]'),
      page(),
      { typing: false, inDialog: true },
    ],
    [
      'the page while a menu is open elsewhere',
      inside(),
      page('[role="menu"][data-state="open"]'),
      { typing: false, inDialog: true },
    ],
    [
      'the canvas while its right-click menu is open',
      inside(),
      page('[data-open-layer]'),
      { typing: false, inDialog: true },
    ],
  ])('reads %s', (_name, target, root, expected) => {
    expect(keyContext(target, root)).toEqual(expected)
  })
})
