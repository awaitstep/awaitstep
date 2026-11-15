import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../../lib/api-client'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeStepsStore } from '../../../stores/ide-steps-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { StepInspector } from '../step-inspector'
import { StepsView } from '../steps-view'
import { irNode, loadGraph, SyncHarness } from './fixtures/step-sync'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../contexts/node-registry-context', async () => {
  const { templateRegistry } = await import('./fixtures/template-nodes')
  return { useNodeRegistry: () => templateRegistry() }
})
vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkflowRuns: async () => ({ data: [], nextCursor: null }),
      getWorkflowRunSteps: async () => ({ data: [], coalescedInto: {} }),
    },
  }
})

const HELLO = irNode('hello', 'Say hello', 'custom:hello', { target: 'ops', greeting: 'Hi' })

beforeEach(() => {
  switchView.mockReset()
  useIdeStore.getState().resetSession()
  useIdeStepsStore.getState().reset()
  useIdeLayoutStore.setState({ sideBarTab: 'steps', dockOpen: false })
  useWorkflowStore.getState().reset()
  loadGraph(
    [irNode('sample', 'Sample step'), HELLO, irNode('mail', 'Mail', 'resend', { inline: true })],
    [
      { id: 'e1', source: 'sample', target: 'hello' },
      { id: 'e2', source: 'hello', target: 'mail' },
    ],
  )
})

describe('a custom node in Code', () => {
  it('lists it in the Steps view with its version, and a marketplace node with its own', () => {
    render(
      <SyncHarness>
        <StepsView
          tabs={null}
          onEscape={vi.fn()}
          canEdit
          readOnlyMessage={null}
          onUndoGraphEdit={vi.fn(() => false)}
          onCreateStep={vi.fn()}
        />
      </SyncHarness>,
    )
    expect(screen.getByRole('treeitem', { name: /Say hello/ })).toHaveTextContent(
      'Custom node · v1.0.1',
    )
    expect(screen.getByRole('treeitem', { name: /Mail/ })).toHaveTextContent(
      'Marketplace node · v2.0.0 · inline',
    )
  })

  it('shows its retries, its fields read-only without edit rights, and Edit on canvas', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SyncHarness>
          <StepInspector nodeId="hello" />
        </SyncHarness>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Custom node · v1.0.1')).toBeInTheDocument()
    // Outside a workspace that may edit, the fields are shown, not changed.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Settings' }))
    await screen.findByRole('dialog')
    expect(screen.getByDisplayValue('ops')).toBeDisabled()
    expect(screen.getByDisplayValue('Hi')).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Inline — no step' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close panel' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit on canvas' }))
    expect(switchView).toHaveBeenCalledWith('canvas', { version: undefined, node: 'hello' })
  })
})
