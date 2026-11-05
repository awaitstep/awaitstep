import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import type { WorkflowSummary } from '../../../lib/api-client'
import { WorkflowActionsMenu } from '../workflow-actions-menu'

const calls = vi.hoisted(() => ({
  goTo: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  getVersion: vi.fn(),
  getDeployConnections: vi.fn(),
  takedownDeployment: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => calls.navigate }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => calls.goTo }))
vi.mock('../../../lib/api-client', () => ({
  api: {
    createWorkflow: calls.createWorkflow,
    deleteWorkflow: calls.deleteWorkflow,
    getVersion: calls.getVersion,
    getDeployConnections: calls.getDeployConnections,
    takedownDeployment: calls.takedownDeployment,
    createVersion: vi.fn(),
  },
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
const WORKFLOW: WorkflowSummary = {
  id: 'wf_1',
  name: 'Lead enrichment',
  kind: 'workflow',
  workspaceId: 'ws_sales',
  currentVersionId: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

function renderMenu(workflow: WorkflowSummary, inWorkspace = true) {
  const menu = (
    <QueryClientProvider client={new QueryClient()}>
      <WorkflowActionsMenu workflow={workflow} />
    </QueryClientProvider>
  )
  return render(
    inWorkspace ? <EditorScopeProvider value={SLUGS}>{menu}</EditorScopeProvider> : menu,
  )
}

async function choose(item: string) {
  await userEvent.click(screen.getByRole('button'))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

afterEach(() => vi.clearAllMocks())

describe('WorkflowActionsMenu', () => {
  it('opens Runs and Deployments in the workspace', async () => {
    renderMenu(WORKFLOW)
    await choose('Runs')
    expect(calls.goTo).toHaveBeenCalledWith('/acme/core/sales/workflows/wf_1/runs')
    await choose('Deployments')
    expect(calls.goTo).toHaveBeenCalledWith('/acme/core/sales/workflows/wf_1/deployments')
  })

  it('keeps a copy in the original’s workspace and opens its overview there', async () => {
    calls.createWorkflow.mockResolvedValue({ ...WORKFLOW, id: 'wf_2' })
    // Duplicating needs a saved version: without one there is nothing to copy.
    calls.getVersion.mockResolvedValue({ ir: '{}' })
    renderMenu({ ...WORKFLOW, currentVersionId: 'v1' }, true)
    await choose('Duplicate')
    await waitFor(() =>
      expect(calls.goTo).toHaveBeenCalledWith('/acme/core/sales/workflows/wf_2/overview'),
    )
    expect(calls.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws_sales' }),
    )
  })

  it('duplicates a workflow with no description without sending null, which the API refuses', async () => {
    calls.createWorkflow.mockResolvedValue({ ...WORKFLOW, id: 'wf_2' })
    calls.getVersion.mockResolvedValue({ ir: '{}' })
    renderMenu({ ...WORKFLOW, description: null, currentVersionId: 'v1' })
    await choose('Duplicate')
    await waitFor(() => expect(calls.createWorkflow).toHaveBeenCalled())
    expect(calls.createWorkflow.mock.calls[0]![0].description).toBeUndefined()
  })

  it('goes back to the Functions list after deleting a function in a workspace', async () => {
    calls.deleteWorkflow.mockResolvedValue(undefined)
    renderMenu({ ...WORKFLOW, kind: 'script' })
    await choose('Delete')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    // Replaced, so Back can't return to the deleted function's page.
    await waitFor(() =>
      expect(calls.goTo).toHaveBeenCalledWith('/acme/core/sales/functions', { replace: true }),
    )
    expect(calls.navigate).not.toHaveBeenCalled()
  })

  it('takes it down from the account it went out with, not the org’s first', async () => {
    calls.getDeployConnections.mockResolvedValue({
      connections: [{ id: 'c-other' }],
      defaultId: 'c-other',
      deployedWith: [{ id: 'c-live', name: 'Acme production' }],
    })
    calls.takedownDeployment.mockResolvedValue({ success: true })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkflowActionsMenu workflow={WORKFLOW} isDeployed />
      </QueryClientProvider>,
    )
    await choose('Take down')
    await userEvent.click(await screen.findByRole('button', { name: 'Take down' }))
    await waitFor(() => expect(calls.takedownDeployment).toHaveBeenCalledWith('wf_1', 'c-live'))
  })

  it('goes back to the old list on the old pages', async () => {
    calls.deleteWorkflow.mockResolvedValue(undefined)
    renderMenu(WORKFLOW, false)
    await choose('Delete')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(calls.navigate).toHaveBeenCalledWith({ to: '/workflows', replace: true }),
    )
  })
})
