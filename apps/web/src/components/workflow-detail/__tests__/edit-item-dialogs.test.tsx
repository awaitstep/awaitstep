import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../../lib/api-client'
import { MoveItemDialog } from '../edit-item-dialogs'

const listed = vi.hoisted(() => ({
  workspaces: [] as { slug: string; name: string; viewerCanEdit: boolean }[],
}))
const calls = vi.hoisted(() => ({
  move: vi.fn(),
  goTo: vi.fn(),
}))

vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => calls.goTo }))
vi.mock('../../../data/dashboard/workspaces', () => ({
  useWorkspaces: () => ({ data: listed.workspaces }),
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

beforeEach(() => {
  vi.clearAllMocks()
  listed.workspaces = [
    { slug: 'sales', name: 'Sales', viewerCanEdit: true },
    { slug: 'ops', name: 'Ops', viewerCanEdit: true },
  ]
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

  it('offers only workspaces you can edit', async () => {
    listed.workspaces = [
      { slug: 'sales', name: 'Sales', viewerCanEdit: true },
      { slug: 'finance', name: 'Finance', viewerCanEdit: false },
      { slug: 'ops', name: 'Ops', viewerCanEdit: true },
    ]
    calls.move.mockImplementation((_input, { onSuccess }) => onSuccess({ moved: 1 }))
    wrap(<MoveItemDialog workflow={WORKFLOW} slugs={SLUGS} word="workflow" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Workspace' }))
    expect(screen.queryByRole('option', { name: 'Finance' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Ops' })).toBeInTheDocument()
  })

  it('says so when no other workspace is one you can edit', () => {
    listed.workspaces = [
      { slug: 'sales', name: 'Sales', viewerCanEdit: true },
      { slug: 'finance', name: 'Finance', viewerCanEdit: false },
    ]
    wrap(<MoveItemDialog workflow={WORKFLOW} slugs={SLUGS} word="workflow" onClose={vi.fn()} />)
    expect(
      screen.getByText('There’s no other workspace in this project you can edit.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Move workflow' })).toBeDisabled()
  })
})
