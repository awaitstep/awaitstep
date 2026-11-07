import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { CanvasSidePanels } from '../canvas-side-panels'

vi.mock('../node-config-panel', () => ({ NodeConfigPanel: () => <div>inspector panel</div> }))
vi.mock('../local-test-panel', () => ({ LocalTestPanel: () => <div>local test panel</div> }))
vi.mock('../code-preview', () => ({ CodePreview: () => <div>code preview panel</div> }))

function renderPanels() {
  return render(
    <CanvasSidePanels showLocalTest={false} onCloseLocalTest={vi.fn()} workflowId="w" />,
  )
}

beforeEach(() => {
  useCanvasLayoutStore.setState({ inspectorOpen: true, codePreviewOpen: false })
  useWorkflowStore.setState({ selectedNodeId: 'n1' })
})

describe('CanvasSidePanels inspector toggle', () => {
  it('shows the inspector for a selected step while the toggle is on', () => {
    renderPanels()
    expect(screen.getByText('inspector panel')).toBeInTheDocument()
  })

  it('hides the inspector when the toggle is off and brings it back when on', () => {
    useCanvasLayoutStore.setState({ inspectorOpen: false })
    renderPanels()
    expect(screen.queryByText('inspector panel')).toBeNull()
    act(() => useCanvasLayoutStore.setState({ inspectorOpen: true }))
    expect(screen.getByText('inspector panel')).toBeInTheDocument()
  })
})

describe('CanvasSidePanels code preview', () => {
  it('takes the inspector space while the preview is open', () => {
    useCanvasLayoutStore.setState({ codePreviewOpen: true })
    renderPanels()
    expect(screen.getByText('code preview panel')).toBeInTheDocument()
    expect(screen.queryByText('inspector panel')).toBeNull()
  })
})
