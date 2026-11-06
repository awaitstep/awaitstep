import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { IdeHeader } from '../ide-header'

vi.mock('../../workflows/env-vars-dialog', () => ({
  EnvVarsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Environment variables" /> : null,
}))
const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: { back: vi.fn() } }) }))
vi.mock('../../../lib/workflows/detail-links', () => ({
  useWorkflowLinks: () => ({ overview: '/overview', deployments: '/deployments' }),
}))
const follow = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useGoTo: () => follow,
}))
const exportWorkflowFile = vi.fn()
vi.mock('../../../lib/export-workflow', () => ({ exportWorkflowFile: () => exportWorkflowFile() }))

const DEPLOY = {
  hasActiveDeployment: false,
  hasUndeployedChanges: false,
  deployedVersion: undefined,
  currentVersion: 3,
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof IdeHeader>> = {}) {
  const props = {
    workflowId: 'wf_1',
    workflowName: 'Orders',
    version: 3,
    deployState: DEPLOY,
    dirtyCount: 0,
    canEdit: true,
    saving: false,
    onSave: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<IdeHeader {...props} />) }
}

beforeEach(() => {
  switchView.mockReset()
  exportWorkflowFile.mockReset()
  useIdeLayoutStore.setState({ explorerOpen: true, dockOpen: true, previewOpen: true })
  useIdeStore.getState().closeDialog()
})

describe('IdeHeader', () => {
  it('has no Deploy button and no Test button', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: /Deploy/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Test/ })).toBeNull()
  })

  it('saves all files and shows how many are unsaved', async () => {
    const { props } = renderHeader({ dirtyCount: 2 })
    const save = screen.getByRole('button', { name: 'Save all (2)' })
    expect(screen.getByText('2')).toBeInTheDocument()
    await userEvent.click(save)
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('has nothing to save when no file is unsaved, or the version cannot be edited', () => {
    const { rerender, props } = renderHeader()
    expect(screen.getByRole('button', { name: 'Save all' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    rerender(<IdeHeader {...props} dirtyCount={1} canEdit={false} />)
    expect(screen.getByRole('button', { name: 'Save all (1)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('reflects the layout store in aria-pressed and toggles it', async () => {
    renderHeader()
    const sideBar = screen.getByRole('button', { name: /side bar/ })
    expect(sideBar).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sideBar)
    expect(useIdeLayoutStore.getState().explorerOpen).toBe(false)
    expect(screen.getByRole('button', { name: /side bar/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /canvas preview/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('opens Go to file and the palette from the menu', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Go to file/ }))
    expect(useIdeStore.getState().dialog).toBe('quickOpen')
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Command palette/ }))
    expect(useIdeStore.getState().dialog).toBe('palette')
  })

  it('opens the environment variables dialog from ⋯ without leaving the code workspace', async () => {
    renderHeader({ versionParam: 'ver_1' })
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Environment variables…' }))
    expect(await screen.findByRole('dialog', { name: 'Environment variables' })).toBeInTheDocument()
    expect(switchView).not.toHaveBeenCalled()
  })

  it('opens the environment variables dialog on ⌥⌘V, and shows the chord on the item', async () => {
    renderHeader()
    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true })
    expect(await screen.findByRole('dialog', { name: 'Environment variables' })).toBeInTheDocument()
  })

  it('carries only the version when it switches to the canvas', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: /Canvas/ }))
    expect(switchView).toHaveBeenCalledWith('canvas', { version: undefined })
  })

  it('explains an empty export on the row and keeps the row reachable by arrow keys', async () => {
    const workflow = await import('../../../stores/workflow-store')
    workflow.useWorkflowStore.setState({ nodes: [] })
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = await screen.findByRole('menuitem', { name: 'Export' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Nothing to export yet')).toBeVisible()
    expect(item).toHaveAccessibleDescription('Nothing to export yet')
    await userEvent.click(item)
    expect(exportWorkflowFile).not.toHaveBeenCalled()
  })

  it('says on the export row that unsaved file edits are left out', async () => {
    const workflow = await import('../../../stores/workflow-store')
    workflow.useWorkflowStore.setState({
      nodes: [{ id: 'n', type: 'step', position: { x: 0, y: 0 }, data: {} }] as never,
    })
    renderHeader({ dirtyCount: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = await screen.findByRole('menuitem', { name: 'Export' })
    expect(item).not.toHaveAttribute('aria-disabled')
    expect(item).toHaveAccessibleDescription('Without your unsaved file edits')
    await userEvent.click(item)
    expect(exportWorkflowFile).toHaveBeenCalledTimes(1)
    workflow.useWorkflowStore.setState({ nodes: [] })
  })

  it('shows a Viewer on the latest version View only, with their own reason on Save', () => {
    renderHeader({ canEdit: false, dirtyCount: 1, viewOnlyReason: 'Editing needs an Editor' })
    expect(screen.getByText('View only')).toHaveAttribute('title', 'Editing needs an Editor')
    const save = screen.getByRole('button', { name: 'Save all (1)' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Editing needs an Editor')
    expect(save.getAttribute('title')).not.toMatch(/can’t be edited/)
  })

  it('tells someone who can edit, on an older version, to open the latest', () => {
    renderHeader({ canEdit: false, historicalVersion: 1, dirtyCount: 0 })
    expect(screen.queryByText('View only')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save all' })).toHaveAccessibleDescription(
      'Open the latest version to make changes',
    )
  })

  it('tells a Viewer on an older version why, not to open the latest to edit', () => {
    renderHeader({
      canEdit: false,
      historicalVersion: 1,
      viewOnlyReason: 'Editing needs an Editor',
    })
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save all' })).toHaveAccessibleDescription(
      'Editing needs an Editor',
    )
  })

  it('says why Save all is off when nothing is unsaved', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Save all' })).toHaveAccessibleDescription(
      'No unsaved files',
    )
  })

  it('still offers the environment variables when the files cannot be edited', async () => {
    renderHeader({ canEdit: false })
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Environment variables…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
  })

  it('replaces the version badge on an older version and leads back to the latest', async () => {
    renderHeader({ historicalVersion: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Viewing v1, back to latest' }))
    expect(switchView).toHaveBeenCalledWith('ide')
  })

  it('says No version yet for a workflow nobody has saved on the canvas', () => {
    renderHeader({ version: undefined })
    expect(screen.getByText('No version yet')).toBeInTheDocument()
  })

  it('opens the canvas through the switch, carrying the version being read', async () => {
    renderHeader({ versionParam: 'ver_1' })
    await userEvent.click(screen.getByRole('button', { name: /Canvas/ }))
    expect(switchView).toHaveBeenCalledWith('canvas', { version: 'ver_1' })
  })
})
