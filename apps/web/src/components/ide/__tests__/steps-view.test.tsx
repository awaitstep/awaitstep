import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeStepsStore } from '../../../stores/ide-steps-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { StepsView } from '../steps-view'
import { irNode, loadGraph, SyncHarness } from './fixtures/step-sync'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined } }),
}))

function setup(
  props: Partial<Parameters<typeof SyncHarness>[0]> = {},
  canEdit = true,
  readOnlyMessage: string | null = null,
) {
  const onEscape = vi.fn()
  const onCreateStep = vi.fn(async () => ({
    status: 'created' as const,
    nodeId: 'created',
    path: 'steps/created.ts',
    opened: true,
  }))
  render(
    <SyncHarness {...props}>
      <StepsView
        tabs={<span>tabs</span>}
        onEscape={onEscape}
        canEdit={canEdit}
        readOnlyMessage={readOnlyMessage}
        onCreateStep={onCreateStep}
      />
    </SyncHarness>,
  )
  return { onEscape, onCreateStep }
}

const item = (name: RegExp | string) => screen.getByRole('treeitem', { name })

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeStepsStore.getState().reset()
  useIdeLayoutStore.setState({ sideBarTab: 'steps' })
  useWorkflowStore.getState().reset()
  loadGraph()
})

describe('StepsView', () => {
  it('lists the steps in graph order with a branch’s arms nested', () => {
    setup()
    const rows = screen.getAllByRole('treeitem')
    expect(rows.map((r) => r.getAttribute('data-step-id'))).toEqual([
      'validate',
      'charge',
      'check',
      'ship',
      'wait',
    ])
    expect(rows.map((r) => r.getAttribute('aria-level'))).toEqual(['1', '1', '1', '2', '2'])
    expect(item(/Paid\?/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('says where each step lives and what it is set to', () => {
    setup()
    expect(item(/Charge card/)).toHaveTextContent('retries 3 · uses 1 file')
    expect(item(/Wait 2 days/)).toHaveTextContent('In workflow.ts')
  })

  it('opens a step’s file and selects it when clicked', async () => {
    setup()
    await userEvent.setup().click(item(/Validate order/))
    expect(useIdeStore.getState().activePath).toBe('nodes/validate_order.ts')
    expect(useIdeStore.getState().selectedNodeId).toBe('validate')
  })

  it('only selects a step that has no file of its own', async () => {
    setup()
    useIdeStore.getState().openFile('package.json')
    await userEvent.setup().click(item(/Wait 2 days/))
    expect(useIdeStore.getState().selectedNodeId).toBe('wait')
    expect(useIdeStore.getState().activePath).toBe('package.json')
  })

  it('picks a step with Enter and keeps the keyboard in the list', async () => {
    setup()
    const user = userEvent.setup()
    const first = item(/Validate order/)
    first.focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(item(/Charge card/)).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(useIdeStore.getState().activePath).toBe('nodes/charge_card.ts')
    expect(useIdeStore.getState().selectedNodeId).toBe('charge')
    expect(item(/Charge card/)).toHaveFocus()
  })

  it('marks the step whose file is in the active tab', () => {
    useIdeStore.getState().openFile('nodes/charge_card.ts')
    setup()
    expect(item(/Charge card/)).toHaveAttribute('aria-current', 'true')
    expect(item(/Validate order/)).not.toHaveAttribute('aria-current')
  })

  it('keeps marking the step while its Compare tab is active, and none for Review', () => {
    setup()
    act(() => useIdeStore.getState().openCompare('nodes/charge_card.ts'))
    expect(item(/Charge card/)).toHaveAttribute('aria-current', 'true')
    act(() => useIdeStore.getState().openReview())
    expect(document.querySelector('[aria-current="true"]')).toBeNull()
  })

  it('follows the active tab as it changes', () => {
    setup()
    expect(document.querySelector('[aria-current="true"]')).toBeNull()
    act(() => useIdeStore.getState().openFile('nodes/ship_order.ts'))
    expect(item(/Ship order/)).toHaveAttribute('aria-current', 'true')
  })

  it('folds and unfolds a container with the arrow keys', async () => {
    setup()
    const user = userEvent.setup()
    item(/Paid\?/).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('treeitem', { name: /Ship order/ })).toBeNull()
    expect(item(/Paid\?/)).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{ArrowRight}')
    expect(item(/Ship order/)).toBeInTheDocument()
  })

  it('folds with the chevron too', async () => {
    setup()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse Paid?' }))
    expect(screen.queryByRole('treeitem', { name: /Wait 2 days/ })).toBeNull()
  })

  it('hands the keyboard back to the editor on Escape', async () => {
    const { onEscape } = setup()
    item(/Validate order/).focus()
    await userEvent.setup().keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('keeps one row in the tab order', () => {
    setup()
    expect(
      screen.getAllByRole('treeitem').filter((r) => r.getAttribute('tabindex') === '0'),
    ).toHaveLength(1)
  })

  it('takes the keyboard when asked, once the view is showing', async () => {
    useIdeLayoutStore.setState({ sideBarTab: 'explorer' })
    setup()
    act(() => useIdeStore.getState().requestStepsFocus())
    expect(document.activeElement?.getAttribute('role')).not.toBe('treeitem')
    act(() => useIdeLayoutStore.setState({ sideBarTab: 'steps' }))
    await waitFor(() => expect(item(/Validate order/)).toHaveFocus())
    expect(useIdeStore.getState().stepsFocusRequested).toBe(false)
  })

  it('reads the same for a function without a manifest: no step files, nothing to open', async () => {
    // A function's steps are modules now, so a missing manifest means an
    // older version, exactly as for a workflow.
    setup({ manifest: null, kind: 'script' })
    expect(screen.getByText(/No step files for this version/)).toBeInTheDocument()
    await userEvent.setup().click(item(/Validate order/))
    expect(useIdeStore.getState().selectedNodeId).toBe('validate')
    expect(useIdeStore.getState().openPaths).toEqual([])
  })

  it('explains an empty graph', () => {
    useWorkflowStore.getState().reset()
    setup()
    expect(screen.getByText(/No steps in this version/)).toBeInTheDocument()
  })

  it('says a version is needed, with the way to the canvas, when the workflow was never saved', async () => {
    useWorkflowStore.getState().reset()
    setup({ graphVersionId: null, manifest: null, codeVersionId: null })
    expect(screen.getByText('Save a version on the canvas first')).toBeInTheDocument()
    expect(screen.queryByText(/No steps in this version/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open canvas' }))
    expect(switchView).toHaveBeenCalledWith('canvas')
  })

  it('creates a step after the last step of the main chain from the header', async () => {
    loadGraph([irNode('a', 'A'), irNode('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByText('After B')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge card{Enter}')
    expect(onCreateStep).toHaveBeenCalledWith({ after: 'b' }, 'Charge card')
    await waitFor(() => expect(useIdeStore.getState().editorFocusRequested).toBe(true))
    expect(screen.queryByRole('textbox', { name: 'Step name' })).toBeNull()
  })

  it('appends after the last plain row when the version has no steps', async () => {
    loadGraph([irNode('setup', 'Setup', 'sleep')], [])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByText('After Setup')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Start{Enter}')
    expect(onCreateStep).toHaveBeenCalledWith({ after: 'setup' }, 'Start')
  })

  it('skips a branching last row and appends after the last plain step', async () => {
    // The fixture ends at the branch "Paid?"; the + must not target it (it
    // has two arms and no single "after").
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByText('After Wait 2 days')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge{Enter}')
    expect(onCreateStep).toHaveBeenCalledWith({ after: 'wait' }, 'Charge')
  })

  it('makes the first step when the version has no nodes at all', async () => {
    loadGraph([], [])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByText('First step')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Start{Enter}')
    expect(onCreateStep).toHaveBeenCalledWith({ first: true }, 'Start')
  })

  it('refuses an empty name in place and keeps the row open', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.keyboard('{Enter}')
    expect(screen.getByText('Enter a step name.')).toBeInTheDocument()
    expect(onCreateStep).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Step name' })).toBeInTheDocument()
  })

  it('cancels the name row on Escape', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Step name' })).toBeNull()
  })

  it('offers one choice per connection on a branch and places the step on it', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step after Paid?' }))
    await user.hover(screen.getByRole('menuitem', { name: /New step after/ }))
    // Radix submenu items do not take a synthetic user.click in jsdom; a
    // plain click exercises the same onSelect the browser fires.
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Into paid' }))
    expect(useIdeStepsStore.getState().create).toEqual({ after: 'check', edgeId: 'e3' })
    expect(screen.getByText('Into paid')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge{Enter}')
    expect(onCreateStep).toHaveBeenCalledWith({ after: 'check', edgeId: 'e3' }, 'Charge')
  })

  it('names an unlabelled (or empty-labelled) arm by its target', async () => {
    loadGraph(
      [irNode('gate', 'Gate', 'branch'), irNode('a', 'A'), irNode('b', 'B')],
      [
        { id: 'e1', source: 'gate', target: 'a', label: '' },
        { id: 'e2', source: 'gate', target: 'b', label: '' },
      ],
    )
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New step after Gate' }))
    await user.hover(screen.getByRole('menuitem', { name: /New step after/ }))
    expect(await screen.findByRole('menuitem', { name: 'Before A' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Before B' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Into ' })).toBeNull()
  })

  it('keeps the create controls, disabled with the reason, when the workspace cannot edit', () => {
    setup({}, false, 'Older versions are read-only.')
    expect(screen.getByRole('button', { name: 'New step' })).toBeDisabled()
    const menus = screen.getAllByRole('button', { name: /New step after/ })
    expect(menus.length).toBeGreaterThan(0)
    for (const menu of menus) {
      expect(menu).toBeDisabled()
      expect(menu).toHaveAttribute('title', 'Older versions are read-only.')
    }
  })
})
