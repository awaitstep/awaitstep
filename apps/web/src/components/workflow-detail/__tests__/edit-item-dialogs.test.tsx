import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../../lib/api-client'
import { MoveItemDialog, RenameItemDialog } from '../edit-item-dialogs'

const calls = vi.hoisted(() => ({
  update: vi.fn(),
  move: vi.fn(),
  goTo: vi.fn(),
}))

vi.mock('../../../lib/api-client', () => ({ api: { updateWorkflow: calls.update } }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => calls.goTo }))
vi.mock('../../../data/dashboard/workspaces', () => ({
  useWorkspaces: () => ({
    data: [
      { slug: 'sales', name: 'Sales' },
      { slug: 'ops', name: 'Ops' },
    ],
  }),
}))
vi.mock('../../../data/dashboard/items', () => ({
  useMoveWorkflows: () => ({
    mutate: calls.move,
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
  }),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
const WORKFLOW: WorkflowSummary = {
  id: 'wf_1',
  name: 'Lead enrichment',
  description: null,
  createdAt: '',
  updatedAt: '',
}

function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('RenameItemDialog', () => {
  it('saves the new name and description, then closes', async () => {
    calls.update.mockResolvedValue(undefined)
    const onClose = vi.fn()
    wrap(<RenameItemDialog workflow={WORKFLOW} word="workflow" onClose={onClose} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Lead scoring ')
    await userEvent.type(screen.getByRole('textbox', { name: /Description/ }), 'Scores leads')
    await userEvent.click(save)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls.update).toHaveBeenCalledWith('wf_1', {
      name: 'Lead scoring',
      description: 'Scores leads',
    })
  })
})

describe('MoveItemDialog', () => {
  it('stays put when nothing moved: it doesn’t live at the new address', async () => {
    calls.move.mockImplementation((_input, { onSuccess }) => onSuccess({ moved: 0 }))
    const onClose = vi.fn()
    wrap(<MoveItemDialog workflow={WORKFLOW} slugs={SLUGS} word="workflow" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move workflow' }))
    expect(calls.goTo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('moves it to another workspace and opens it there, replacing the old address', async () => {
    calls.move.mockImplementation((_input, { onSuccess }) => onSuccess({ moved: 1 }))
    wrap(<MoveItemDialog workflow={WORKFLOW} slugs={SLUGS} word="workflow" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move workflow' }))
    expect(calls.move).toHaveBeenCalledWith({ itemIds: ['wf_1'], to: 'ops' }, expect.anything())
    expect(calls.goTo).toHaveBeenCalledWith('/acme/core/ops/workflows/wf_1/overview', {
      replace: true,
    })
  })
})
