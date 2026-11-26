import { describe, expect, it } from 'vitest'
import { nodeClickEffect } from '../node-click'

describe('nodeClickEffect', () => {
  it.each([
    [
      'hides the settings of the selected node',
      'a',
      true,
      false,
      { select: false, inspectorOpen: false },
    ],
    [
      'shows them again on the next click',
      'a',
      false,
      false,
      { select: false, inspectorOpen: true },
    ],
    [
      'selects another node and shows its settings',
      'b',
      false,
      false,
      { select: true, inspectorOpen: true },
    ],
    [
      'selects another node behind the code preview, leaving the inspector',
      'b',
      true,
      true,
      { select: true, inspectorOpen: null },
    ],
    [
      'leaves the inspector behind the code preview on the selected node',
      'a',
      true,
      true,
      { select: false, inspectorOpen: null },
    ],
  ])('%s', (_name, clickedId, inspectorOpen, codePreviewOpen, effect) => {
    expect(nodeClickEffect({ clickedId, selectedId: 'a', inspectorOpen, codePreviewOpen })).toEqual(
      effect,
    )
  })
})
