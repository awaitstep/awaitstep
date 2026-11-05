import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { TriggerDialog } from '../trigger-dialog'

const calls = vi.hoisted(() => ({
  goTo: vi.fn(),
  navigate: vi.fn(),
  trigger: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => calls.navigate }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => calls.goTo }))
vi.mock('../../../lib/api-client', () => ({
  api: { triggerWorkflow: calls.trigger, getDeployConnections: vi.fn() },
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }

function renderDialog(inWorkspace: boolean, deployedVersion?: number) {
  const client = new QueryClient()
  client.setQueryData(['deploy-connections', 'wf_1'], {
    connections: [],
    defaultId: null,
    deployedWith: [{ id: 'c_1', name: 'Acme CF' }],
  })
  const dialog = (
    <QueryClientProvider client={client}>
      <TriggerDialog workflowId="wf_1" deployedVersion={deployedVersion} onClose={vi.fn()} />
    </QueryClientProvider>
  )
  render(inWorkspace ? <EditorScopeProvider value={SLUGS}>{dialog}</EditorScopeProvider> : dialog)
}

afterEach(() => vi.clearAllMocks())

describe('TriggerDialog (WorkflowTrigger)', () => {
  it('names the version it runs, where, and what the payload is for', () => {
    renderDialog(true, 12)
    expect(screen.getByRole('dialog', { name: 'Trigger a run' })).toBeVisible()
    expect(screen.getByText('Runs v12, the deployed version.')).toBeVisible()
    expect(screen.getByText('Where this run executes.')).toBeVisible()
    expect(screen.getByText('The workflow reads it as the trigger input.')).toBeVisible()
    expect(screen.getByText('It appears in Runs straight away.')).toBeVisible()
  })
})

describe('TriggerDialog after a trigger', () => {
  it('opens the run it just started, in the workspace', async () => {
    calls.trigger.mockResolvedValue({ id: 'run_7', instanceId: 'i', status: 'queued' })
    renderDialog(true)
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }))
    await waitFor(() =>
      expect(calls.goTo).toHaveBeenCalledWith('/acme/core/sales/workflows/wf_1/runs/run_7'),
    )
    expect(calls.navigate).not.toHaveBeenCalled()
  })

  it('refreshes the workflow page’s run counts', async () => {
    calls.trigger.mockResolvedValue({ id: 'run_7', instanceId: 'i', status: 'queued' })
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    renderDialog(true)
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dash', 'workflow-run-counts'] }),
    )
    invalidate.mockRestore()
  })

  it('goes to the old Runs list on the old pages', async () => {
    calls.trigger.mockResolvedValue({ id: 'run_7', instanceId: 'i', status: 'queued' })
    renderDialog(false)
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }))
    await waitFor(() => expect(calls.navigate).toHaveBeenCalledWith({ to: '/runs' }))
    expect(calls.goTo).not.toHaveBeenCalled()
  })
})
