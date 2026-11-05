import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorToolbar, type EditorToolbarProps } from '../editor-toolbar'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../lib/workflows/detail-links', () => ({
  useWorkflowLinks: () => ({ overview: '/overview' }),
}))
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}))
vi.mock('../../workflows/workspace-chrome', () => ({
  WorkspaceChrome: ({ title, actions }: { title: React.ReactNode; actions: React.ReactNode }) => (
    <div>
      {title}
      {actions}
    </div>
  ),
}))
vi.mock('../time-travel', () => ({ undoWithFeedback: vi.fn(), redoWithFeedback: vi.fn() }))

function props(overrides: Partial<EditorToolbarProps> = {}): EditorToolbarProps {
  return {
    workflowId: 'wf_1',
    isNew: false,
    workflowName: 'Orders',
    currentVersion: 0,
    nodeCount: 0,
    isDirty: false,
    hasActiveDeployment: false,
    hasUndeployedChanges: false,
    deployedVersion: undefined,
    showSettings: false,
    onToggleSettings: vi.fn(),
    onSave: vi.fn(),
    isSaving: false,
    onDeploy: vi.fn(),
    onTest: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => switchView.mockReset())

describe('EditorToolbar code control', () => {
  it('is shown for a saved workflow that has no version yet, and opens the code view', async () => {
    render(<EditorToolbar {...props({ currentVersion: 0 })} />)
    await userEvent.click(screen.getByRole('button', { name: /Code/ }))
    expect(switchView).toHaveBeenCalledWith('ide', { version: undefined })
  })

  it('is shown for a workflow with versions', () => {
    render(<EditorToolbar {...props({ currentVersion: 3 })} />)
    expect(screen.getByRole('button', { name: /Code/ })).toBeInTheDocument()
  })

  it('is not shown for a workflow that has no row yet', () => {
    render(<EditorToolbar {...props({ isNew: true })} />)
    expect(screen.queryByRole('button', { name: /Code/ })).toBeNull()
  })
})
