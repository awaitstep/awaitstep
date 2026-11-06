import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { CanvasSidePanels } from '../canvas-side-panels'
import { EditorToolbar, type EditorToolbarProps } from '../editor-toolbar'
import { TemplatePicker } from '../template-picker'

const switchView = vi.fn()
const follow = vi.fn()
let mac = false
vi.mock('../../../lib/platform', () => ({ isMacPlatform: () => mac }))
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: { back: vi.fn() } }) }))
vi.mock('../../../lib/workflows/detail-links', () => ({
  useWorkflowLinks: () => ({ overview: '/overview', deployments: '/deployments' }),
}))
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useGoTo: () => follow,
}))
vi.mock('../time-travel', () => ({ undoWithFeedback: vi.fn(), redoWithFeedback: vi.fn() }))
vi.mock('../../workflows/env-vars-dialog', () => ({
  EnvVarsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Environment variables" /> : null,
}))
vi.mock('../node-config-panel', () => ({ NodeConfigPanel: () => <div>inspector panel</div> }))
vi.mock('../local-test-panel', () => ({ LocalTestPanel: () => <div>local test panel</div> }))

function props(overrides: Partial<EditorToolbarProps> = {}): EditorToolbarProps {
  return {
    workflowId: 'wf_1',
    isNew: false,
    workflowName: 'Orders',
    currentVersion: 3,
    nodeCount: 2,
    isDirty: false,
    hasActiveDeployment: false,
    hasUndeployedChanges: false,
    deployedVersion: undefined,
    onSave: vi.fn(),
    isSaving: false,
    onDeploy: vi.fn(),
    onCheck: vi.fn(),
    ...overrides,
  }
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

beforeEach(() => {
  switchView.mockReset()
  follow.mockReset()
  mac = false
  useCanvasLayoutStore.setState({ paletteOpen: false, inspectorOpen: true })
  useWorkflowStore.setState({ selectedNodeId: null })
})

describe('EditorToolbar code control', () => {
  it('is shown for a saved workflow that has no version yet, and opens the code view', async () => {
    render(<EditorToolbar {...props({ currentVersion: 0, nodeCount: 0 })} />)
    await userEvent.click(screen.getByRole('button', { name: /Code/ }))
    expect(switchView).toHaveBeenCalledWith('ide', { version: undefined })
  })

  it('is shown for a workflow with versions', () => {
    render(<EditorToolbar {...props()} />)
    expect(screen.getByRole('button', { name: /Code/ })).toBeInTheDocument()
  })

  it('is not shown for a workflow that has no row yet', () => {
    render(<EditorToolbar {...props({ isNew: true })} />)
    expect(screen.queryByRole('button', { name: /Code/ })).toBeNull()
  })
})

describe('EditorToolbar actions', () => {
  it('has no Test button and no Preview toggle', () => {
    render(<EditorToolbar {...props()} />)
    expect(screen.queryByRole('button', { name: /^Test/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull()
  })

  it('keeps every other action reachable: Deploy on the bar, the rest in the menu', async () => {
    const p = props({
      onTestLocally: vi.fn(),
      onOpenTemplatePicker: vi.fn(),
      onExport: vi.fn(),
    })
    render(<EditorToolbar {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Deploy' }))
    expect(p.onDeploy).toHaveBeenCalledTimes(1)

    await openMenu()
    for (const name of [
      'Environment variables…',
      'Templates',
      'Export',
      'Local test',
      'Check workflow',
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('menuitem', { name: 'Check workflow' }))
    expect(p.onCheck).toHaveBeenCalledTimes(1)
  })

  it('offers no Go to file or Command palette: the canvas has neither', async () => {
    render(<EditorToolbar {...props()} />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /Go to file/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Command palette/ })).toBeNull()
  })

  it('offers Local test and Templates only when they are enabled', async () => {
    render(<EditorToolbar {...props()} />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Local test' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Templates' })).toBeNull()
  })

  it('saves from the bar, naming it a new version', async () => {
    const p = props({ isDirty: true })
    render(<EditorToolbar {...p} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save.getAttribute('title')).toMatch(/Save a new version/)
    await userEvent.click(save)
    expect(p.onSave).toHaveBeenCalledTimes(1)
  })

  it('has nothing to save when nothing changed, and says so', async () => {
    const p = props()
    render(<EditorToolbar {...p} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('No changes to save')
    expect(save).not.toBeDisabled()
    await userEvent.click(save)
    expect(p.onSave).not.toHaveBeenCalled()
  })

  it('keeps a disabled Save in the Tab order so its reason can be reached', async () => {
    render(<EditorToolbar {...props({ readOnly: true, olderVersion: true, readOnlyVersion: 1 })} />)
    await userEvent.tab()
    for (
      let i = 0;
      i < 12 && document.activeElement !== screen.getByRole('button', { name: 'Save' });
      i++
    ) {
      await userEvent.tab()
    }
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })

  it('shows failed saves with the reason, and says Saving… once, on the Save button', () => {
    const { rerender } = render(<EditorToolbar {...props({ isDirty: true, isSaving: true })} />)
    const saving = screen.getAllByTitle('Saving…')
    expect(saving).toHaveLength(1)
    expect(saving[0]).toBe(screen.getByRole('button', { name: 'Save' }))
    expect(saving[0]).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByText('Saving…', { ignore: '.sr-only' })).toHaveLength(1)
    rerender(<EditorToolbar {...props({ isDirty: true, saveError: 'Network down' })} />)
    expect(screen.getByTitle('Network down')).toBeInTheDocument()
  })
})

describe('EditorToolbar view toggles', () => {
  it('names Inspector the same whether or not it is showing', async () => {
    useWorkflowStore.setState({ selectedNodeId: 'n1' })
    render(<EditorToolbar {...props()} />)
    const inspector = screen.getByRole('button', { name: /^Inspector \(/ })
    const name = inspector.getAttribute('aria-label')
    await userEvent.click(inspector)
    expect(screen.getByRole('button', { name: /^Inspector \(/ })).toHaveAttribute(
      'aria-label',
      name,
    )
  })

  it('reports Inspector pressed only while it is on screen', async () => {
    render(<EditorToolbar {...props()} />)
    // The preference is on, but no step is selected: nothing is showing.
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
    expect(screen.getByRole('button', { name: /^Inspector/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    act(() => useWorkflowStore.setState({ selectedNodeId: 'n1' }))
    expect(screen.getByRole('button', { name: /^Inspector/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: /^Inspector/ }))
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(false)
    expect(screen.getByRole('button', { name: /^Inspector/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows a hidden inspector again when asked with a step selected, never hides it twice over', async () => {
    useCanvasLayoutStore.setState({ inspectorOpen: false })
    useWorkflowStore.setState({ selectedNodeId: 'n1' })
    render(<EditorToolbar {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /^Inspector/ }))
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
  })

  it('arms the inspector, without hiding anything, when asked with no step selected', async () => {
    render(<EditorToolbar {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /^Inspector/ }))
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
  })

  it('maps Steps to aria-pressed from the canvas layout store', async () => {
    render(<EditorToolbar {...props()} />)
    const steps = screen.getByRole('button', { name: /^Steps/ })
    expect(steps).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(steps)
    expect(useCanvasLayoutStore.getState().paletteOpen).toBe(true)
    expect(screen.getByRole('button', { name: /^Steps/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['a Mac', true, '{Meta>}', '{/Meta}', '{Control>}', '{/Control}'],
    ['Windows or Linux', false, '{Control>}', '{/Control}', '{Meta>}', '{/Meta}'],
  ])(
    'toggles with the platform modifier alone on %s',
    async (_name, isMac, down, up, otherDown, otherUp) => {
      mac = isMac
      useWorkflowStore.setState({ selectedNodeId: 'n1' })
      render(<EditorToolbar {...props()} />)
      await userEvent.keyboard(`${otherDown}b${otherUp}${otherDown}j${otherUp}`)
      expect(useCanvasLayoutStore.getState().paletteOpen).toBe(false)
      expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
      await userEvent.keyboard(`${down}b${up}`)
      expect(useCanvasLayoutStore.getState().paletteOpen).toBe(true)
      await userEvent.keyboard(`${down}j${up}`)
      expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(false)
    },
  )

  it('titles its shortcuts for the platform', () => {
    mac = true
    const { unmount } = render(<EditorToolbar {...props()} />)
    expect(screen.getByRole('button', { name: 'Steps (⌘B)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo (⌘Z)')
    unmount()
    mac = false
    render(<EditorToolbar {...props()} />)
    expect(screen.getByRole('button', { name: 'Steps (Ctrl+B)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo (Ctrl+Z)')
  })

  it('has nothing to add while read-only, so Steps is off', () => {
    render(<EditorToolbar {...props({ readOnly: true, olderVersion: true, readOnlyVersion: 1 })} />)
    expect(screen.getByRole('button', { name: /steps/i })).toBeDisabled()
  })
})

describe('EditorToolbar states', () => {
  it('replaces the version badge on an older version and leads back to the latest', async () => {
    render(<EditorToolbar {...props({ readOnly: true, olderVersion: true, readOnlyVersion: 1 })} />)
    expect(screen.queryByText('v3')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Viewing v1, back to latest' }))
    expect(switchView).toHaveBeenCalledWith('canvas')
    const save = screen.getByRole('button', { name: 'Save' })
    const deploy = screen.getByRole('button', { name: 'Deploy' })
    for (const button of [save, deploy]) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('Open the latest version to make changes')
    }
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('still leads back to the latest when the old version is not among those loaded', async () => {
    // GET /workflows/:id/full lists the newest 100 versions; an older one has no number here.
    render(<EditorToolbar {...props({ readOnly: true, olderVersion: true })} />)
    expect(screen.queryByText('v3')).toBeNull()
    const back = screen.getByRole('button', { name: 'Viewing an older version, back to latest' })
    await userEvent.click(back)
    expect(switchView).toHaveBeenCalledWith('canvas')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription(
      'Open the latest version to make changes',
    )
  })

  it('says a Viewer is view only, with their own reason on Save and Deploy', () => {
    render(
      <EditorToolbar
        {...props({
          readOnly: true,
          viewOnlyReason: 'Building, deploying and sharing need an Editor',
        })}
      />,
    )
    expect(screen.getByText('View only')).toHaveAttribute(
      'title',
      'Building, deploying and sharing need an Editor',
    )
    for (const name of ['Save', 'Deploy']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('Building, deploying and sharing need an Editor')
    }
    expect(screen.queryByText(/Viewing v/)).toBeNull()
  })

  it('does not send a Viewer on an old version to the latest to edit', () => {
    render(
      <EditorToolbar
        {...props({
          readOnly: true,
          olderVersion: true,
          readOnlyVersion: 2,
          viewOnlyReason: 'Building, deploying and sharing need an Editor',
        })}
      />,
    )
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Viewing v2, back to latest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription(
      'Building, deploying and sharing need an Editor',
    )
  })

  it('says access is loading, not "open the latest", while the role is not known yet', () => {
    // Read-only on the latest version with no reason: the workspace scope has not answered.
    render(<EditorToolbar {...props({ readOnly: true })} />)
    expect(screen.queryByText('View only')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription(
      'Checking your access…',
    )
    expect(screen.getByRole('button', { name: 'Deploy' })).toHaveAccessibleDescription(
      'Checking your access…',
    )
  })

  it('still lets a Viewer export: it only reads', async () => {
    render(
      <EditorToolbar {...props({ readOnly: true, viewOnlyReason: 'No', onExport: vi.fn() })} />,
    )
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Export' })).toBeInTheDocument()
    // Variables belong to the workflow, so a Viewer can still look.
    expect(screen.getByRole('menuitem', { name: 'Environment variables…' })).toBeInTheDocument()
  })

  it('says No version yet on a blank workflow and disables Deploy with the reason', () => {
    render(<EditorToolbar {...props({ currentVersion: 0, nodeCount: 0 })} />)
    expect(screen.getByText('No version yet')).toBeInTheDocument()
    const deploy = screen.getByRole('button', { name: 'Deploy' })
    expect(deploy).toHaveAttribute('aria-disabled', 'true')
    expect(deploy).toHaveAttribute('title', 'Add a step first')
    expect(deploy).toHaveAccessibleDescription('Add a step first')
  })

  it('keeps Deploy on for an unsaved new workflow that has steps (Deploy saves first)', () => {
    render(<EditorToolbar {...props({ isNew: true, currentVersion: 0, nodeCount: 2 })} />)
    expect(screen.getByText('No version yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled()
  })

  it('shows the node count and the deploy state', () => {
    render(
      <EditorToolbar
        {...props({
          nodeCount: 7,
          hasActiveDeployment: true,
          deployedVersion: 2,
          currentVersion: 3,
          hasUndeployedChanges: true,
        })}
      />,
    )
    expect(screen.getAllByText('7 nodes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('deployed v2 · v3 not deployed').length).toBeGreaterThan(0)
  })
})

describe('EditorToolbar ⋯ menu', () => {
  it('reaches a disabled Redo with the arrow keys and says why it is off', async () => {
    render(<EditorToolbar {...props()} />)
    await openMenu()
    const redo = await screen.findByRole('menuitem', { name: 'Redo' })
    expect(redo).toHaveAttribute('aria-disabled', 'true')
    expect(redo).toHaveAccessibleDescription('Nothing to redo')
    expect(screen.getByText('Nothing to redo')).toBeVisible()
    // A disabled attribute would have skipped it: End must land on the last row.
    await userEvent.keyboard('{End}')
    expect(redo).toHaveFocus()
  })

  it('does not run a disabled item and keeps the menu open', async () => {
    render(<EditorToolbar {...props()} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Undo' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('opens the environment variables dialog on ⌥⌘V, but not on an unsaved canvas', async () => {
    const first = render(<EditorToolbar {...props()} />)
    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true })
    expect(await screen.findByRole('dialog', { name: 'Environment variables' })).toBeInTheDocument()
    first.unmount()
    render(<EditorToolbar {...props({ isNew: true })} />)
    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true })
    expect(screen.queryByRole('dialog', { name: 'Environment variables' })).toBeNull()
  })

  it('opens the environment variables dialog, and Esc hands focus back to ⋯', async () => {
    render(<EditorToolbar {...props()} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Environment variables…' }))
    expect(await screen.findByRole('dialog', { name: 'Environment variables' })).toBeInTheDocument()
  })
})

function FocusHarness({ nodeCount, dialog }: { nodeCount: number; dialog?: boolean }) {
  const [localTest, setLocalTest] = useState(false)
  const [picker, setPicker] = useState(false)
  const [asking, setAsking] = useState(false)
  function handleTemplates() {
    if (dialog) setAsking(true)
    else setPicker(true)
  }
  return (
    <>
      <EditorToolbar
        {...props({
          nodeCount,
          onTestLocally: () => setLocalTest(true),
          onOpenTemplatePicker: handleTemplates,
        })}
      />
      <CanvasSidePanels
        showLocalTest={localTest}
        onCloseLocalTest={() => setLocalTest(false)}
        workflowId="w"
      />
      {picker && <TemplatePicker onDismiss={() => setPicker(false)} />}
      {asking && <ConfirmStub />}
    </>
  )
}

function ConfirmStub() {
  // What Radix's dialog does: it takes focus a moment after it mounts.
  return (
    <div
      role="alertdialog"
      aria-label="Replace the steps?"
      tabIndex={-1}
      ref={(el) => {
        setTimeout(() => el?.focus(), 30)
      }}
    />
  )
}

describe('EditorToolbar focus after a ⋯ item', () => {
  async function choose(name: string) {
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name }))
  }
  const moreActions = () => screen.getByRole('button', { name: 'More actions' })

  it('moves focus into the Local test panel, and Esc closes it back to ⋯', async () => {
    render(<FocusHarness nodeCount={2} />)
    await choose('Local test')
    const panel = await screen.findByRole('complementary', { name: 'Local test' })
    await waitFor(() => expect(panel).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Local test' })).toBeNull()
    expect(moreActions()).toHaveFocus()
  })

  it('moves focus into the template picker when there are no steps to replace', async () => {
    render(<FocusHarness nodeCount={0} />)
    await choose('Templates')
    const picker = await screen.findByRole('region', { name: 'Templates' })
    await waitFor(() => expect(picker).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Templates' })).toBeNull()
    expect(moreActions()).toHaveFocus()
  })

  it('leaves focus to the confirmation that Templates raises when there are steps', async () => {
    render(<FocusHarness nodeCount={3} dialog />)
    await choose('Templates')
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(dialog).toHaveFocus())
    expect(moreActions()).not.toHaveFocus()
  })

  it.each(['Check workflow', 'Export'])(
    'returns focus to ⋯ after %s, which opens nothing that takes it',
    async (name) => {
      render(<EditorToolbar {...props({ onExport: vi.fn() })} />)
      await choose(name)
      await waitFor(() => expect(moreActions()).toHaveFocus())
    },
  )
})

describe('EditorToolbar when Code changed the workflow', () => {
  it('withdraws Save with the reason, says Changed in Code and offers Reload', async () => {
    const p = props({ isDirty: true, saveConflict: true, onReload: vi.fn() })
    render(<EditorToolbar {...p} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Reload to continue')
    await userEvent.click(save)
    expect(p.onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Changed in Code')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(p.onReload).toHaveBeenCalledTimes(1)
  })

  it('shows the reload running and takes the button out of reach meanwhile', () => {
    render(<EditorToolbar {...props({ isDirty: true, saveConflict: true, reloading: true })} />)
    const reload = screen.getByRole('button', { name: 'Reloading…' })
    expect(reload).toBeDisabled()
    expect(reload).toHaveAttribute('aria-busy', 'true')
  })
})
