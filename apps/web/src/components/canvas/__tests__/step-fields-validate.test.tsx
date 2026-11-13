import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStepCodeErrorsStore } from '../../../stores/step-code-errors-store'
import { StepFields } from '../step-fields'

// Monaco has no place in jsdom: the editor hands its onValidate out instead.
const editor = vi.hoisted(() => ({
  onValidate: undefined as undefined | ((errors: number, text: string) => void),
}))
vi.mock('../../ui/code-editor', () => ({
  CodeEditor: ({ onValidate }: { onValidate?: (errors: number, text: string) => void }) => {
    editor.onValidate = onValidate
    return null
  },
}))

const node = {
  id: 'n1',
  type: 'step',
  name: 'log',
  position: { x: 0, y: 0 },
  version: '1.0.0',
  provider: 'cloudflare',
  data: { code: 'return { result: "ok"' },
}

beforeEach(() => useStepCodeErrorsStore.setState({ checked: new Map() }))

describe('a step editor’s errors', () => {
  it('are recorded against the code they were found in, for the save to read', () => {
    render(
      <StepFields
        node={node as never}
        kind="workflow"
        scope={{
          varName: 'log',
          upstream: [],
          bindings: [],
          status: 'ok',
          returned: false,
          exportKey: 'log',
        }}
        schema={{}}
        onChange={vi.fn()}
        onEnlarge={vi.fn()}
      />,
    )
    editor.onValidate?.(1, 'return { result: "ok"')
    expect(useStepCodeErrorsStore.getState().checked.get('n1')).toEqual({
      code: 'return { result: "ok"',
      errors: 1,
    })
  })
})
