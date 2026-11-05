import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { ValidationPanel } from '../validation-panel'

const fitView = vi.fn()
vi.mock('@xyflow/react', () => ({ useReactFlow: () => ({ fitView }) }))

beforeEach(() => {
  fitView.mockReset()
  useCanvasLayoutStore.setState({ inspectorOpen: false })
  useWorkflowStore.setState({
    selectedNodeId: null,
    nodes: [],
    validationResult: {
      canPublish: false,
      issues: [{ severity: 'error', nodeId: 'n1', nodeName: 'Fetch', message: 'No code' }],
    },
  })
})

describe('ValidationPanel', () => {
  it('brings a hidden inspector back when an issue takes you to its step', async () => {
    render(<ValidationPanel />)
    await userEvent.click(screen.getByRole('button', { name: /No code/ }))
    expect(useWorkflowStore.getState().selectedNodeId).toBe('n1')
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
  })
})
