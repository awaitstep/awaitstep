import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import type { StepPlacement } from '@awaitstep/codegen'
import { orderSteps, type OrderEdge } from '../../../lib/ide/step-order'
import { flowChoices } from '../../../lib/ide/step-flow-choices'
import { StepFlowMap } from '../step-flow-map'

function node(id: string, name: string, type = 'step'): WorkflowNode {
  return { id, type, name, version: '1.0.0', provider: 'cloudflare', data: {} }
}

const nodes = [
  node('start', 'Validate order'),
  node('tc', 'Try me', 'try_catch'),
  node('risky', 'Risky call'),
  node('handle', 'Handle decline'),
  node('cleanup', 'Cleanup'),
  node('end', 'Send receipt'),
]
const edges: (OrderEdge & { id: string })[] = [
  { id: 'e1', source: 'start', target: 'tc' },
  { id: 'e2', source: 'tc', target: 'risky', label: 'try' },
  { id: 'e3', source: 'tc', target: 'handle', label: 'catch' },
  { id: 'e4', source: 'tc', target: 'cleanup', label: 'finally' },
  { id: 'e5', source: 'tc', target: 'end', label: 'then' },
]
const rows = orderSteps(
  nodes.map((n, i) => ({ id: n.id, type: n.type, position: { x: 0, y: i * 80 } })),
  edges,
)
const nodeMap = new Map(nodes.map((n) => [n.id, n]))
const reachable = new Set(nodes.map((n) => n.id))

function renderMap(placement: StepPlacement | null = { after: 'start' }) {
  const onSelect = vi.fn()
  render(
    <StepFlowMap
      rows={rows}
      nodes={nodeMap}
      edges={edges}
      entryNodeId="start"
      reachable={reachable}
      kind="workflow"
      name="notify_ops"
      choices={flowChoices(true, rows, nodeMap, edges, 'start')}
      triggerLabel="POST /orders"
      placement={placement}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

describe('StepFlowMap', () => {
  it('draws the trigger, the flow and the ghost at the selected connection', () => {
    renderMap()
    expect(screen.getByText('POST /orders')).toBeInTheDocument()
    expect(screen.getByText('Validate order')).toBeInTheDocument()
    expect(screen.getByText('Try me')).toBeInTheDocument()
    const ghost = screen.getByText('lands here').closest('div')
    expect(ghost).toHaveTextContent('notify_ops')
    expect(ghost).toHaveTextContent('New')
  })

  it('puts the arm rows inside the container with their chips and insert buttons', () => {
    renderMap()
    for (const chip of ['try', 'catch', 'finally']) {
      expect(screen.getByText(chip)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Into try' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Into catch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Into finally' })).toBeInTheDocument()
  })

  it('selects an arm connection with its + button', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderMap()
    await user.click(screen.getByRole('button', { name: 'Into catch' }))
    expect(onSelect).toHaveBeenCalledWith({ after: 'tc', edgeId: 'e3' })
  })

  it('gives every choice in the flow a + control', () => {
    const choices = flowChoices(true, rows, nodeMap, edges, 'start')
    renderMap(null)
    for (const choice of choices) {
      expect(screen.getByRole('button', { name: choice.label })).toBeInTheDocument()
    }
  })

  it('renders hostile IR text as text, never as markup', () => {
    const badName = '<img src=x onerror="alert(1)">'
    const badLabel = '<script>alert(1)</script>'
    const hostileNodes = [node('x', badName), node('y', 'Next')]
    const hostileEdges = [{ id: 'h1', source: 'x', target: 'y', label: badLabel }]
    const hostileRows = orderSteps(
      hostileNodes.map((n, i) => ({ id: n.id, type: n.type, position: { x: 0, y: i * 80 } })),
      hostileEdges,
    )
    const hostileMap = new Map(hostileNodes.map((n) => [n.id, n]))
    const { container } = render(
      <StepFlowMap
        rows={hostileRows}
        nodes={hostileMap}
        edges={hostileEdges}
        entryNodeId="x"
        reachable={new Set(['x', 'y'])}
        kind="workflow"
        name={badName}
        choices={flowChoices(true, hostileRows, hostileMap, hostileEdges, 'x')}
        triggerLabel={badLabel}
        placement={null}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(badName)).toBeInTheDocument()
    expect(screen.getByText(badLabel)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('selects the first-step spot and the after-last spot', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderMap()
    await user.click(screen.getByRole('button', { name: 'Before the first step' }))
    expect(onSelect).toHaveBeenLastCalledWith({ first: true })
  })
})
