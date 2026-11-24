import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NodeBase } from '../node-base'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { useRunOverlayStore } from '../../../stores/run-overlay-store'

const flowState = vi.hoisted(() => ({
  nodesConnectable: false,
  nodeLookup: new Map(),
  edges: [],
  transform: [0, 0, 1],
}))

vi.mock('@xyflow/react', () => ({
  useNodeId: () => 'step-1',
  Handle: () => null,
  useStore: (select: (s: unknown) => unknown) => select(flowState),
  useStoreApi: () => ({ getState: () => flowState }),
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
}))

const initial = useWorkflowStore.getState()

afterEach(() => {
  useWorkflowStore.setState(initial, true)
  useRunOverlayStore.getState().clearOverlay()
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
    render(<NodeBase label="Fetch lead" nodeType="step" />)
    expect(screen.getByText('Fetch lead')).toBeTruthy()
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth/)
    errors.mockRestore()
  })

  it('shows the node’s kind under its name, and its config line', () => {
    render(
      <NodeBase label="Wait a bit" nodeType="sleep">
        10 seconds
      </NodeBase>,
    )
    expect(screen.getByText('Sleep')).toBeTruthy()
    expect(screen.getByText('10 seconds')).toBeTruthy()
  })

  it('puts the step’s run status in the header while a run is shown', () => {
    useRunOverlayStore.getState().setOverlay({ 'step-1': 'errored' })
    render(<NodeBase label="Fetch lead" nodeType="step" chip="v1.0.1" />)
    expect(screen.getByText('Failed')).toBeTruthy()
    // The run's chip takes the place of the version.
    expect(screen.queryByText('v1.0.1')).toBeNull()
  })

  it('keeps a selected node with an error outlined red', () => {
    issues({ severity: 'error', message: 'Add a name' })
    const { container } = render(<NodeBase label="Fetch lead" nodeType="step" selected />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('border-status-error/70')
    expect(card.className).not.toMatch(/(^|\s)border-primary(\s|$)/)
  })
})
