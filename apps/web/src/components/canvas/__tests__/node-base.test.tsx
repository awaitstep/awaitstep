import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NodeBase } from '../node-base'
import { useWorkflowStore } from '../../../stores/workflow-store'

vi.mock('@xyflow/react', () => ({
  useNodeId: () => 'step-1',
  Handle: () => null,
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
}))

const initial = useWorkflowStore.getState()

afterEach(() => {
  useWorkflowStore.setState(initial, true)
})

function issues(...list: { severity: 'error' | 'warning'; message: string }[]) {
  useWorkflowStore.setState({
    validationResult: {
      canPublish: false,
      issues: list.map((i) => ({ ...i, nodeId: 'step-1' })),
    } as never,
  })
}

describe('NodeBase', () => {
  it('renders a node with a validation issue without re-rendering forever', () => {
    // Saving with issues puts them in the store; each read used to build a new object.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    issues({ severity: 'error', message: 'Add a name' })
    render(<NodeBase label="Fetch lead" icon={null} accent="blue" />)
    expect(screen.getByText('Fetch lead')).toBeTruthy()
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth/)
    errors.mockRestore()
  })
})
