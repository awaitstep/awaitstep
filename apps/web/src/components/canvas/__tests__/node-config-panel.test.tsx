import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { NodeConfigPanel } from '../node-config-panel'
import { StepFields } from '../step-fields'

// Monaco has no place in jsdom; the editor is a textarea here.
vi.mock('../../ui/code-editor', () => ({
  CodeEditor: ({
    value,
    onChange,
    height,
    readOnly,
  }: {
    value: string
    onChange: (v: string) => void
    height?: string
    readOnly?: boolean
  }) => (
    <textarea
      aria-label="code"
      data-height={height}
      data-readonly={String(readOnly ?? false)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

function step(data: Record<string, unknown> = {}) {
  return {
    id: 'k3j9x_a1b2c3',
    type: 'step',
    name: 'Charge card',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return { result: "ok" };', ...data } as Record<string, unknown>,
  }
}

function select(irNode: ReturnType<typeof step>, kind: 'workflow' | 'script' = 'workflow') {
  useWorkflowStore.setState({
    kind,
    selectedNodeId: irNode.id,
    nodes: [{ id: irNode.id, type: irNode.type, position: irNode.position, data: { irNode } }],
    edges: [],
  } as never)
}

beforeEach(() => {
  useWorkflowStore.getState().reset()
})

describe('NodeConfigPanel for a step', () => {
  it('shows one shell: the kind, the name, the file the code lives in, and the id', () => {
    select(step())
    render(<NodeConfigPanel />)
    expect(screen.getByText('Edit node')).toBeInTheDocument()
    expect(screen.getByText('Step')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Charge card')
    expect(screen.getByText('steps/k3j9x_a1b2c3.ts')).toBeInTheDocument()
    expect(screen.getByText('ID k3j9x_a1b2c3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete node' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument()
  })

  it('folds the execution settings under a line that says what is set', async () => {
    select(step({ retryLimit: 3, retryDelay: '10 seconds', timeout: '30 seconds' }))
    render(<NodeConfigPanel />)
    const header = screen.getByRole('button', { name: /Execution/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(header).toHaveTextContent('retries 3 · timeout 30s')
    expect(screen.getByText('Retry Limit')).toBeInTheDocument()
    expect(screen.getByText('Backoff')).toBeInTheDocument()
    expect(screen.getByText('Retry Delay')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Retry Limit')).toBeNull()
    expect(header).toHaveTextContent('retries 3 · timeout 30s')
  })

  it('reads Default for a workflow step with nothing set, and No retries for a function’s', () => {
    select(step())
    const { unmount } = render(<NodeConfigPanel />)
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent('Default')
    unmount()
    select(step(), 'script')
    render(<NodeConfigPanel />)
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent('No retries')
  })

  it('hides retries and timeout once the step is inline, and says so in the summary', async () => {
    select(step())
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data.inline).toBe(true)
    expect(screen.queryByText('Retry Limit')).toBeNull()
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent('Inline')
  })

  it('enlarges the editor to fill the panel, names the step, file and settings, and collapses back', async () => {
    select(step({ retryLimit: 3, retryDelay: '10 seconds' }))
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    expect(screen.getByLabelText('code')).toHaveAttribute('data-height', '100%')
    expect(screen.getByText('Charge card')).toBeInTheDocument()
    expect(screen.getByText('steps/k3j9x_a1b2c3.ts')).toBeInTheDocument()
    expect(screen.getByText('TypeScript · retries 3')).toBeInTheDocument()
    expect(screen.queryByText('Execution')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse editor' }))
    expect(screen.getByLabelText('code')).toHaveAttribute('data-height', '160px')
    expect(screen.getByText('Execution')).toBeInTheDocument()
  })

  it('closes from the enlarged editor', async () => {
    select(step())
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })

  it('shows the switch and the grid for a function’s step too, and brings the grid back when inline is off', async () => {
    select(step(), 'script')
    render(<NodeConfigPanel />)
    expect(screen.getByRole('switch', { name: 'Inline — no step' })).toBeInTheDocument()
    expect(screen.getByLabelText('Retry Limit')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    expect(screen.queryByLabelText('Retry Limit')).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    expect(screen.getByLabelText('Retry Limit')).toBeInTheDocument()
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data.inline).toBe(false)
  })

  it('names each grid control by its label, and the visible inline text toggles the switch', async () => {
    select(step())
    render(<NodeConfigPanel />)
    expect(screen.getByLabelText('Retry Limit')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Retry Delay')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Timeout')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Backoff')).toHaveAttribute('role', 'combobox')
    expect(screen.getByText('Per-attempt timeout.')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Runs in the body. No retries, timeout or durability.'))
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data.inline).toBe(true)
  })

  it('leaving an empty Retry delay does not turn retries on', () => {
    select(step(), 'script')
    render(<NodeConfigPanel />)
    const delay = screen.getByLabelText('Retry Delay')
    fireEvent.focus(delay)
    fireEvent.blur(delay)
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data).toEqual({
      code: 'return { result: "ok" };',
    })
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent('No retries')
  })

  it('reads one setting alone in the summary', () => {
    select(step({ retryLimit: 3 }))
    const { unmount } = render(<NodeConfigPanel />)
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent(/retries 3$/)
    unmount()
    select(step({ timeout: '30 seconds' }))
    render(<NodeConfigPanel />)
    expect(screen.getByRole('button', { name: /Execution/ })).toHaveTextContent(/timeout 30s$/)
  })

  it('heads the enlarged editor with TypeScript alone when nothing is set, and inline when it is', async () => {
    select(step())
    const { unmount } = render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    unmount()
    select(step({ inline: true }))
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    expect(screen.getByText('TypeScript · inline')).toBeInTheDocument()
  })

  it('shows the next node’s fields, not the editor, when another node is picked while enlarged', async () => {
    const first = step()
    const second = { ...step(), id: 'second', name: 'Second' }
    useWorkflowStore.setState({
      kind: 'workflow',
      selectedNodeId: first.id,
      nodes: [first, second].map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { irNode: n },
      })),
      edges: [],
    } as never)
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    expect(screen.getByRole('button', { name: 'Collapse editor' })).toHaveFocus()
    act(() => useWorkflowStore.getState().selectNode('second'))
    expect(screen.getByLabelText('Name')).toHaveValue('Second')
    expect(screen.getByText('Execution')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse editor' })).toBeNull()
  })

  it('puts focus back on Enlarge after Collapse', async () => {
    select(step())
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse editor' }))
    expect(screen.getByRole('button', { name: 'Enlarge editor' })).toHaveFocus()
  })

  it('keeps the node selected when Close is pressed in the enlarged editor on empty code', async () => {
    select(step({ code: '' }))
    render(<NodeConfigPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge editor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(useWorkflowStore.getState().selectedNodeId).toBe('k3j9x_a1b2c3')
  })

  it('writes a name typed just before another node is picked into the first node, not the second', async () => {
    const first = step()
    const second = { ...step(), id: 'second', name: 'Second' }
    useWorkflowStore.setState({
      kind: 'workflow',
      selectedNodeId: first.id,
      nodes: [first, second].map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { irNode: n },
      })),
      edges: [],
    } as never)
    render(<NodeConfigPanel />)
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Charge card now' } })
    act(() => useWorkflowStore.getState().selectNode('second'))
    const nodes = useWorkflowStore.getState().nodes
    expect(nodes.find((n) => n.id === first.id)!.data.irNode.name).toBe('Charge card now')
    expect(nodes.find((n) => n.id === 'second')!.data.irNode.name).toBe('Second')
  })

  it('is read-only for a read-only version: no control takes input and nothing is written', async () => {
    select(step({ retryLimit: 3 }))
    useWorkflowStore.setState({ readOnly: true })
    render(<NodeConfigPanel />)
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByLabelText('Retry Limit')).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Inline — no step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete node' })).toBeDisabled()
    expect(screen.getByLabelText('code')).toHaveAttribute('data-readonly', 'true')
    fireEvent.change(screen.getByLabelText('code'), { target: { value: 'return 2;' } })
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data.code).toBe(
      'return { result: "ok" };',
    )
    expect(useWorkflowStore.getState().isDirty).toBe(false)
  })

  it('writes an edit to the step code into the node', async () => {
    select(step())
    render(<NodeConfigPanel />)
    await userEvent.clear(screen.getByLabelText('code'))
    await userEvent.type(screen.getByLabelText('code'), 'return 1;')
    expect(useWorkflowStore.getState().nodes[0]!.data.irNode.data.code).toBe('return 1;')
  })
})

describe('StepFields', () => {
  it('still renders a step schema field it does not place by name', () => {
    const node = step()
    const schema = {
      code: { type: 'code' as const, label: 'Step Code', required: true },
      inline: { type: 'boolean' as const, label: 'Inline (no step)', default: false },
      retryLimit: { type: 'number' as const, label: 'Retry Limit' },
      region: { type: 'string' as const, label: 'Region', description: 'Where it runs.' },
    }
    render(
      <StepFields
        node={node as never}
        kind="workflow"
        schema={schema}
        onChange={vi.fn()}
        onEnlarge={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Region')).toBeInTheDocument()
    expect(screen.getByText('Where it runs.')).toBeInTheDocument()
    expect(screen.getByLabelText('Retry Limit')).toBeInTheDocument()
  })
})

describe('NodeConfigPanel for other kinds', () => {
  it('keeps the plain field list for an http request under the new header and footer', () => {
    select({
      ...step(),
      id: 'req',
      type: 'http_request',
      name: 'Fetch',
      data: { url: 'https://example.com', method: 'GET' },
    })
    render(<NodeConfigPanel />)
    expect(screen.getByText('Edit node')).toBeInTheDocument()
    expect(screen.getByLabelText(/^URL/)).toHaveValue('https://example.com')
    expect(screen.queryByText('Execution')).toBeNull()
    expect(screen.getByText('ID req')).toBeInTheDocument()
  })
})

describe('NodeConfigPanel for a sleep', () => {
  it('says what a sleep does beneath its duration', () => {
    select({ ...step(), id: 'nap', type: 'sleep', name: 'Wait', data: { duration: '2 days' } })
    render(<NodeConfigPanel />)
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(
      screen.getByText('The run pauses durably and resumes after the delay. No code, no retries.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Execution')).toBeNull()
  })
})
