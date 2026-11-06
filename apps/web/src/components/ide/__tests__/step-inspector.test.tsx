import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../../lib/api-client'
import type { RunStep, RunSummary } from '../../../lib/api-client'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { StepInspector } from '../step-inspector'
import { EDGES, FILES, irNode, loadGraph, NODES, SyncHarness } from './fixtures/step-sync'

const listWorkflowRuns = vi.fn()
const getWorkflowRunSteps = vi.fn()
const switchView = vi.fn()

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkflowRuns: (...args: unknown[]) => listWorkflowRuns(...args),
      getWorkflowRunSteps: (...args: unknown[]) => getWorkflowRunSteps(...args),
    },
  }
})
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined } }),
}))

const run: RunSummary = {
  id: 'run_1',
  workflowId: 'wf_1',
  versionId: 'v-11',
  connectionId: null,
  instanceId: 'i',
  status: 'errored',
  output: null,
  error: null,
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  updatedAt: new Date().toISOString(),
}

function step(overrides: Partial<RunStep>): RunStep {
  return {
    id: 's',
    runId: 'run_1',
    nodeId: 'charge',
    stepName: 'charge',
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: '2026-11-05T10:00:00.000Z',
    endedAt: '2026-11-05T10:00:00.412Z',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function renderInspector(
  nodeId: string,
  props: Parameters<typeof SyncHarness>[0] extends infer P ? Partial<P> : never = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SyncHarness {...props}>
        <StepInspector nodeId={nodeId} />
      </SyncHarness>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listWorkflowRuns.mockReset().mockResolvedValue({ data: [], nextCursor: null })
  getWorkflowRunSteps.mockReset().mockResolvedValue({ data: [], coalescedInto: {} })
  switchView.mockReset()
  useIdeStore.getState().resetSession()
  useIdeLayoutStore.setState({ dockOpen: false })
  useWorkflowStore.getState().reset()
  loadGraph()
})

describe('StepInspector', () => {
  it('shows retries and timeout as configured, and the file the step lives in', async () => {
    renderInspector('charge')
    expect(screen.getByText('3 retries · exponential from 10s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'nodes/charge_card.ts' })).toBeInTheDocument()
    expect(screen.getByText(/generated/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'lib/payments/charge.ts' })).toBeInTheDocument()
    // Timeout is empty on this step.
    expect(screen.getAllByText('Default')).toHaveLength(1)
    await screen.findByText('No runs yet')
  })

  it('names the editable source first once the workspace has it, with the module beside it, and still runs the module', async () => {
    const files = new Map([
      ...FILES,
      ['steps/charge.ts', { source: "import { c } from '#app/lib/payments/charge'" }],
    ])
    renderInspector('charge', { files })
    expect(screen.getByRole('button', { name: 'steps/charge.ts' })).toBeInTheDocument()
    expect(screen.getByText(/step code/)).toBeInTheDocument()
    expect(screen.getByText('Module')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'nodes/charge_card.ts' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run step' }))
    expect(useIdeStore.getState().activePath).toBe('nodes/charge_card.ts')
    await screen.findByText('No runs yet')
  })

  it('keeps saying why a step has no module when it has a source but no module', async () => {
    const files = new Map([...FILES, ['steps/charge.ts', { source: 'return 1' }]])
    renderInspector('charge', { files, manifest: null, kind: 'script' })
    expect(screen.getByRole('button', { name: 'steps/charge.ts' })).toBeInTheDocument()
    expect(screen.getByText('Module')).toBeInTheDocument()
    expect(screen.getByText('No step files in this version')).toBeInTheDocument()
    const run = screen.getByRole('button', { name: 'Run step' })
    expect(run).toBeDisabled()
    expect(run).toHaveAttribute('title', 'This step has no module of its own to run')
    await screen.findByText('No runs yet')
  })

  it('says a step with no file is written in the workflow file, not worker.ts, and cannot be run', async () => {
    renderInspector('wait')
    expect(screen.getByText(/Written in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'awaitstep/workflow.ts' })).toBeInTheDocument()
    expect(screen.queryByText(/worker\.ts/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Run step' })).toBeDisabled()
    expect(screen.queryByText('Retries')).toBeNull()
    await screen.findByText('No runs yet')
  })

  it('claims no file when the source names none', async () => {
    renderInspector('wait', { workflowFile: null })
    expect(screen.getByText('No file of its own')).toBeInTheDocument()
    expect(screen.queryByText(/worker\.ts/)).toBeNull()
    await screen.findByText('No runs yet')
  })

  it('has no inputs to edit', async () => {
    const { container } = renderInspector('charge')
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0)
    await screen.findByText('No runs yet')
  })

  it('shows an errored last run with its attempts, first error line and the run’s version', async () => {
    listWorkflowRuns.mockResolvedValue({ data: [run], nextCursor: null })
    getWorkflowRunSteps.mockResolvedValue({
      data: [
        step({ status: 'errored', attemptCount: 3, error: 'Card declined\n  at charge.ts:4' }),
      ],
      coalescedInto: {},
    })
    renderInspector('charge')
    await screen.findByText('Errored after 3 attempts')
    expect(screen.getByText('Card declined')).toBeInTheDocument()
    expect(screen.getByText(/2h ago · v11/)).toBeInTheDocument()
    expect(listWorkflowRuns).toHaveBeenCalledWith('wf_1', { limit: 1 })
    expect(getWorkflowRunSteps).toHaveBeenCalledWith('wf_1', 'run_1')
  })

  it('shows a completed step with its time and attempts', async () => {
    listWorkflowRuns.mockResolvedValue({ data: [run], nextCursor: null })
    getWorkflowRunSteps.mockResolvedValue({ data: [step({})], coalescedInto: {} })
    renderInspector('charge')
    await screen.findByText('Complete')
    expect(screen.getByText(/412ms · 1 attempt/)).toBeInTheDocument()
  })

  it('reads a merged step’s outcome from its leader', async () => {
    loadGraph(
      [...NODES, irNode('merged', 'Merged')],
      [...EDGES, { id: 'e9', source: 'ship', target: 'merged' }],
    )
    listWorkflowRuns.mockResolvedValue({ data: [run], nextCursor: null })
    getWorkflowRunSteps.mockResolvedValue({
      data: [step({ nodeId: 'ship', status: 'errored', attemptCount: 2, error: 'boom' })],
      coalescedInto: { merged: 'ship' },
    })
    renderInspector('merged')
    await screen.findByText('Errored after 2 attempts')
  })

  it('says when the last run recorded nothing for this step', async () => {
    listWorkflowRuns.mockResolvedValue({ data: [run], nextCursor: null })
    renderInspector('validate')
    await screen.findByText(/Nothing recorded in the last run/)
  })

  it('says so when the last run cannot be loaded', async () => {
    listWorkflowRuns.mockRejectedValue(new Error('offline'))
    renderInspector('charge')
    await screen.findByText('Couldn’t load the last run')
  })

  it('opens Quick test on the step’s file', async () => {
    renderInspector('charge')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run step' }))
    expect(useIdeStore.getState().activePath).toBe('nodes/charge_card.ts')
    expect(useIdeLayoutStore.getState()).toMatchObject({ dockOpen: true, dockTab: 'quickTest' })
    await screen.findByText('No runs yet')
  })

  it('opens the canvas on this step, on the version the editor named', async () => {
    renderInspector('charge')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit on canvas' }))
    expect(switchView).toHaveBeenCalledWith('canvas', { version: undefined, node: 'charge' })
    await screen.findByText('No runs yet')
  })

  it('opens a file it lists without changing the selection', async () => {
    useIdeStore.getState().selectNode('charge')
    renderInspector('charge')
    await userEvent.setup().click(screen.getByRole('button', { name: 'lib/payments/charge.ts' }))
    expect(useIdeStore.getState().activePath).toBe('lib/payments/charge.ts')
    expect(useIdeStore.getState().selectedNodeId).toBe('charge')
    await screen.findByText('No runs yet')
  })

  it('closes by clearing the selection', async () => {
    useIdeStore.getState().selectNode('charge')
    renderInspector('charge')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close step details' }))
    expect(useIdeStore.getState().selectedNodeId).toBeNull()
  })

  it('renders nothing for a step the graph no longer has, and asks for no run', () => {
    const { container } = renderInspector('gone')
    expect(container).toBeEmptyDOMElement()
    expect(listWorkflowRuns).not.toHaveBeenCalled()
  })

  it('does not ask for the second query until the first has a run', async () => {
    renderInspector('charge')
    await waitFor(() => expect(listWorkflowRuns).toHaveBeenCalled())
    expect(getWorkflowRunSteps).not.toHaveBeenCalled()
  })
})
