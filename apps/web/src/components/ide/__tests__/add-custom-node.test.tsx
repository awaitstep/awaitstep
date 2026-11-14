import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeStepsStore } from '../../../stores/ide-steps-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import type { CreateStepOutcome } from '../../../lib/ide/step-create'
import { StepsView } from '../steps-view'
import { irNode, loadGraph, SyncHarness } from './fixtures/step-sync'

vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => vi.fn() }))
const scope = vi.hoisted(() => ({ canInstall: true }))
vi.mock('../../../contexts/editor-scope-context', () => ({
  useItemSlugs: () => ({ org: 'acme', project: 'p', workspace: 'sales' }),
}))
vi.mock('../../workspaces/use-workspace-scope', () => ({
  useWorkspaceScope: () => ({ orgManager: scope.canInstall }),
}))
vi.mock('../../resources/marketplace-dialog', () => ({
  MarketplaceDialog: ({ org, onClose }: { org: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Marketplace">
      Marketplace for {org}
      <form aria-label="Marketplace search">
        <button type="submit">Search</button>
      </form>
      <button type="button" onClick={onClose}>
        Close marketplace
      </button>
    </div>
  ),
}))
vi.mock('../../../contexts/node-registry-context', async () => {
  const { templateRegistry } = await import('./fixtures/template-nodes')
  return { useNodeRegistry: () => templateRegistry() }
})

function setup(canEdit = true, onCreateStep = created()) {
  render(
    <SyncHarness>
      <StepsView
        tabs={<span>tabs</span>}
        onEscape={vi.fn()}
        canEdit={canEdit}
        readOnlyMessage={canEdit ? null : 'You can view this workflow but not edit it.'}
        onUndoGraphEdit={vi.fn(() => false)}
        onCreateStep={onCreateStep}
      />
    </SyncHarness>,
  )
  return { onCreateStep }
}

function created() {
  return vi.fn((): CreateStepOutcome => ({
    status: 'created',
    nodeId: 'say_hello',
    path: null,
  }))
}

function targetInput() {
  const field = screen.getByText('Who to greet').closest('div')!.parentElement!
  return within(field).getByRole('textbox')
}

async function openCustom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add' }))
  await user.click(screen.getByRole('tab', { name: 'Custom node' }))
}

beforeEach(() => {
  scope.canInstall = true
  useIdeStore.getState().resetSession()
  useIdeStepsStore.getState().reset()
  useIdeLayoutStore.setState({ sideBarTab: 'steps' })
  useWorkflowStore.getState().reset()
  loadGraph(
    [irNode('sample', 'Sample step'), irNode('next', 'Next')],
    [{ id: 'e1', source: 'sample', target: 'next' }],
  )
})

describe('Add → Custom node', () => {
  it('lists the palette’s Library nodes first, then marketplace nodes, and no builtins', async () => {
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    const dialog = screen.getByRole('dialog')
    const groups = within(dialog).getAllByRole('region')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Custom nodes',
      'Communication',
    ])
    expect(groups[0]).toHaveTextContent('Say hello')
    expect(groups[0]).toHaveTextContent('Project')
    expect(groups[0]).toHaveTextContent('v1.0.1')
    expect(groups[1]).toHaveTextContent('Resend')
    expect(within(dialog).queryByText('Sleep')).toBeNull()
  })

  it('opens the picked node with its name, its defaults and its required fields marked', async () => {
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    expect(screen.getByRole('textbox', { name: 'Node name' })).toHaveValue('Say hello')
    expect(screen.getByText('Who to greet').parentElement).toHaveTextContent('*')
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument()
    expect(screen.getByText('Project · v1.0.1')).toBeInTheDocument()
  })

  it('creates it after the chosen step with the fields entered', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    await user.type(targetInput(), 'ops')
    await user.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'sample' }, 'Say hello', 'say_hello', {
        type: 'custom:hello',
        data: { greeting: 'Hello', target: 'ops', inline: true },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // No file to focus: the node is selected instead.
    expect(useIdeStore.getState().editorFocusRequested).toBe(false)
  })

  it('goes back to the list with Change, and keeps Insert off until a node is picked', async () => {
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Resend/ }))
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('textbox', { name: 'Search nodes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('starts as a step again when reopened', async () => {
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('textbox', { name: 'Step name' })).toBeInTheDocument()
  })

  it('offers no Add to someone who cannot edit', () => {
    setup(false)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves a field typed just before Enter submits', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    await user.type(targetInput(), 'ops{Enter}')
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'sample' }, 'Say hello', 'say_hello', {
        type: 'custom:hello',
        data: { greeting: 'Hello', target: 'ops' },
      }),
    )
  })

  it('focuses the new node’s Steps row once it is added', async () => {
    const user = userEvent.setup()
    const onCreateStep = vi.fn((): CreateStepOutcome => {
      // The creator selects the node it added; `next` stands in for it here.
      useIdeStore.getState().selectNode('next')
      return { status: 'created', nodeId: 'next', path: null }
    })
    setup(true, onCreateStep)
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Resend/ }))
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() => expect(document.activeElement?.getAttribute('data-step-id')).toBe('next'))
  })

  it('keeps the picked node and says why when the add is refused', async () => {
    const user = userEvent.setup()
    const onCreateStep = vi.fn((): CreateStepOutcome => ({
      status: 'refused',
      reason: 'That step is not in this version any more.',
    }))
    setup(true, onCreateStep)
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Resend/ }))
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    expect(
      await screen.findByText('That step is not in this version any more.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeEnabled()
  })

  it('keeps the step name and the node name apart, and says to choose a node', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'notify')
    await user.click(screen.getByRole('tab', { name: 'Custom node' }))
    expect(screen.getByText('Choose a node to add')).toBeInTheDocument()
    expect(screen.queryByText('notify')).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Step' }))
    expect(screen.getByRole('textbox', { name: 'Step name' })).toHaveValue('notify')
  })
})

describe('Add → Custom node with required fields', () => {
  it('waits for every required field, naming what is left', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(screen.getByText('Fill in Who to greet')).toBeInTheDocument()
    // No "Required" on a field nobody has touched; Enter doesn't insert.
    expect(screen.queryByText('Required')).toBeNull()
    await user.type(targetInput(), '{Enter}')
    expect(onCreateStep).not.toHaveBeenCalled()
    // Typed and cleared: it says so.
    await user.type(targetInput(), 'x{Backspace}')
    await user.tab()
    expect(await screen.findByText('Required')).toBeInTheDocument()
    await user.type(targetInput(), 'ops')
    await user.tab()
    await waitFor(() => expect(screen.queryByText('Required')).toBeNull())
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled()
    expect(screen.queryByText(/^Fill in/)).toBeNull()
  })

  it('counts blank text as empty', async () => {
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    await user.type(targetInput(), '   ')
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })
})

describe('Add → Custom node on a branch arm', () => {
  it('keeps the arm chosen from a row menu while the node is picked and filled in', async () => {
    loadGraph()
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'Step actions for Paid?' }))
    await user.hover(screen.getByRole('menuitem', { name: /New step after/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Into paid' }))
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Custom node' }))
    await user.click(screen.getByRole('button', { name: /Say hello/ }))
    // Back on the map, with the node's fields under it.
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    await user.type(targetInput(), 'ops')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith(
        { after: 'check', edgeId: 'e3' },
        'Say hello',
        'say_hello',
        { type: 'custom:hello', data: { greeting: 'Hello', target: 'ops' } },
      ),
    )
  })
})

describe('Add → Custom node → Browse marketplace', () => {
  it('opens the marketplace over the list for someone who may install nodes', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await openCustom(user)
    await user.click(screen.getByRole('button', { name: 'Browse marketplace' }))
    expect(screen.getByRole('dialog', { name: 'Marketplace' })).toHaveTextContent(
      'Marketplace for acme',
    )
    // A form inside the marketplace must not insert anything.
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(onCreateStep).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close marketplace' }))
    expect(screen.queryByRole('dialog', { name: 'Marketplace' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Search nodes' })).toBeInTheDocument()
  })

  it('is not offered to someone who may not install nodes', async () => {
    scope.canInstall = false
    const user = userEvent.setup()
    setup()
    await openCustom(user)
    expect(screen.queryByRole('button', { name: 'Browse marketplace' })).toBeNull()
  })
})
