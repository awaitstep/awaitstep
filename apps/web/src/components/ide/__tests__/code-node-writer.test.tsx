import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeSettings, SaveNodeFieldsOutcome } from '../../../lib/ide/step-create'
import { useIdeStore } from '../../../stores/ide-store'
import { useCodeNodeWriter } from '../code-node-writer'
import { NodeEditProvider } from '../node-edit-context'
import { StepInspector } from '../step-inspector'
import { EDGES, irNode, loadGraph, NODES, SyncHarness } from './fixtures/step-sync'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: toastError, info: vi.fn() },
}))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({
    registry: { get: () => undefined },
    customNodes: new Map(),
    customNodesStatus: 'ready',
  }),
}))
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => vi.fn() }))

type Update = (current: NodeSettings) => NodeSettings

function saver() {
  return vi.fn((_nodeId: string, _update: Update): SaveNodeFieldsOutcome => ({
    status: 'recorded',
  }))
}

function wrapperWith(saveNodeEdit: ReturnType<typeof saver>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NodeEditProvider canEdit saveNodeFields={vi.fn()} saveNodeEdit={saveNodeEdit}>
        {children}
      </NodeEditProvider>
    )
  }
}

const WAIT: NodeSettings = {
  name: 'Wait',
  data: { eventType: 'sunny', timeout: '30 seconds' },
  edges: [{ id: 'e1', target: 's', label: 'onEvent' }],
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  toastError.mockReset()
  loadGraph()
})

describe('useCodeNodeWriter', () => {
  it('records an arm’s new target and its field as pending edits', () => {
    const saveNodeEdit = saver()
    const { result } = renderHook(() => useCodeNodeWriter(), { wrapper: wrapperWith(saveNodeEdit) })
    result.current!.setOutgoing('w', (edges) => [
      ...edges,
      { id: 'e2', target: 'late', label: 'onTimeout' },
    ])
    result.current!.setField('w', 'onTimeoutNode', 'late')
    const [first, second] = saveNodeEdit.mock.calls.map(([, update]) => update)
    const afterBoth = second!(first!(WAIT))
    expect(afterBoth.edges).toEqual([
      { id: 'e1', target: 's', label: 'onEvent' },
      { id: 'e2', target: 'late', label: 'onTimeout' },
    ])
    expect(afterBoth.data.onTimeoutNode).toBe('late')
  })

  it('renames a node', () => {
    const saveNodeEdit = saver()
    const { result } = renderHook(() => useCodeNodeWriter(), { wrapper: wrapperWith(saveNodeEdit) })
    result.current!.rename('w', 'Wait for sun')
    expect(saveNodeEdit.mock.calls[0]![1](WAIT).name).toBe('Wait for sun')
  })

  it('won’t switch a step’s Inline while its file has unsaved typing', () => {
    useIdeStore.getState().setDraft('steps/charge.ts', 'typing…', null)
    const saveNodeEdit = saver()
    const { result } = renderHook(() => useCodeNodeWriter(), { wrapper: wrapperWith(saveNodeEdit) })
    result.current!.setField('charge', 'inline', true)
    expect(saveNodeEdit).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      'Save or revert the step’s code first: turning Inline on or off rewrites it.',
    )
  })

  it('won’t rename a step while its file has unsaved typing: the rename rewrites its function name', () => {
    loadGraph([
      ...NODES.filter((n) => n.id !== 'charge'),
      {
        ...NODES.find((n) => n.id === 'charge')!,
        data: {
          code: 'export default async function Charge_card({ env, event, inputs, ctx }) {\n  return 1\n}\n',
        },
      },
    ])
    useIdeStore.getState().setDraft('steps/charge.ts', 'typing…', null)
    const saveNodeEdit = saver()
    const { result } = renderHook(() => useCodeNodeWriter(), { wrapper: wrapperWith(saveNodeEdit) })
    result.current!.rename('charge', 'Charge')
    expect(saveNodeEdit).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      'Save or revert Charge card first: renaming changes its function name.',
    )
  })

  it('says why a change was refused', () => {
    const saveNodeEdit = vi.fn((): SaveNodeFieldsOutcome => ({
      status: 'refused',
      reason: 'Not here any more.',
    }))
    const { result } = renderHook(() => useCodeNodeWriter(), { wrapper: wrapperWith(saveNodeEdit) })
    result.current!.rename('w', 'x')
    expect(toastError).toHaveBeenCalledWith('Not here any more.')
  })
})

describe('the canvas’s settings panel in Code’s node details', () => {
  it('records a rename typed in the panel as a pending edit', async () => {
    loadGraph([...NODES, irNode('nap', 'Nap', 'sleep', { duration: '1 minute' })], EDGES)
    const saveNodeEdit = saver()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SyncHarness>
          <NodeEditProvider canEdit saveNodeFields={vi.fn()} saveNodeEdit={saveNodeEdit}>
            <StepInspector nodeId="charge" />
          </NodeEditProvider>
        </SyncHarness>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.change(await screen.findByDisplayValue('Charge card'), {
      target: { value: 'Charge' },
    })
    await waitFor(() => expect(saveNodeEdit).toHaveBeenCalled())
    expect(saveNodeEdit.mock.calls[0]![0]).toBe('charge')
    expect(saveNodeEdit.mock.calls[0]![1]({ ...WAIT, name: 'Charge card' }).name).toBe('Charge')
  })
})
