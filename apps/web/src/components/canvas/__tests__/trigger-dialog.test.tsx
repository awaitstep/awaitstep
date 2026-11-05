import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../../lib/api-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
const getDeployConnections = vi.hoisted(() => vi.fn())
const triggerWorkflow = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  api: { getDeployConnections, triggerWorkflow },
}))

import { TriggerDialog } from '../trigger-dialog'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }

// A trigger may only name an account the workflow went out with: the dialog
// offers those, its latest first, even when the project has since moved its
// default elsewhere (review round 2026-11-01).

describe('TriggerDialog accounts', () => {
  it('starts on the account the workflow was last deployed with, not the project default', async () => {
    getDeployConnections.mockResolvedValue({
      connections: [
        {
          id: 'c-new',
          provider: 'cloudflare',
          name: 'New default',
          accountSuffix: 'aaaa',
          scope: 'shared',
          tokenStatus: 'active',
          tokenExpiresAt: null,
        },
      ],
      defaultId: 'c-new',
      deployedWith: [{ id: 'c-old', name: 'Old production' }],
    })
    triggerWorkflow.mockResolvedValue({ id: 'run-1' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditorScopeProvider value={SALES}>
          <TriggerDialog workflowId="wf-1" onClose={vi.fn()} />
        </EditorScopeProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('combobox')).toHaveTextContent('Old production')
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }))
    await waitFor(() =>
      expect(triggerWorkflow).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({ connectionId: 'c-old' }),
      ),
    )
  })

  it('says to deploy first when the workflow never went out', async () => {
    getDeployConnections.mockResolvedValue({ connections: [], defaultId: null, deployedWith: [] })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditorScopeProvider value={SALES}>
          <TriggerDialog workflowId="wf-1" onClose={vi.fn()} />
        </EditorScopeProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/isn’t deployed yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeDisabled()
  })
})
