import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeStepsStore } from '../../../stores/ide-steps-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { StepsView } from '../steps-view'
import { FILES, irNode, loadGraph, SyncHarness } from './fixtures/step-sync'

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
    expect(item(/Validate order/)).toHaveTextContent('Entry')
    expect(item(/Ship order/)).toHaveTextContent('paid')
  })

  it('keeps the rail inside the row so the first level stays visible', () => {
    setup()
    const rail = item(/Validate order/).querySelector<HTMLElement>('[aria-hidden]')
    const line = rail?.firstElementChild as HTMLElement
    const dot = rail?.lastElementChild as HTMLElement
    // The dot is 8px wide and centred on its line: at 9px no part is clipped.
    expect(dot.style.left).toBe('9px')
    expect(dot.style.top).toBe('12px')
    expect(parseFloat(dot.style.left) - 4).toBeGreaterThanOrEqual(1)
    // The line must not use `border`, which is 8% white in dark mode.
    expect(line.className).toContain('muted-foreground')
  })

  it('does not join two sibling arms into one vertical line', () => {
    setup()
    for (const name of [/Ship order/, /Wait 2 days/]) {
      const rail = item(name).querySelector<HTMLElement>('[aria-hidden]')!
      expect(
        [...rail.querySelectorAll<HTMLElement>('.w-px')].map((line) => line.style.left),
      ).toEqual(['9px'])
      expect(rail.lastElementChild).toBeInstanceOf(HTMLElement)
      expect((rail.lastElementChild as HTMLElement).style.left).toBe('23px')
    }
  })

  it('marks the derived entry, not whichever root the walk lists first', () => {
    loadGraph(
      [irNode('stray', 'Stray'), irNode('entry', 'Start'), irNode('next', 'Next')],
      [{ id: 'e1', source: 'entry', target: 'next' }],
    )
    setup()
    // "Stray" sorts first, but the saved entry is the root with descendants.
    expect(item(/Start/)).toHaveTextContent('Entry')
    expect(item(/Stray/)).toHaveTextContent('Not connected')
    expect(item(/Stray/)).not.toHaveTextContent('Entry')
    expect(item(/Next/)).not.toHaveTextContent('Not connected')
  })

  it('says where each step lives and what it is set to', () => {
    setup()
    expect(item(/Charge card/)).toHaveTextContent('retries 3 · uses 1 file')
    expect(item(/Wait 2 days/)).toHaveTextContent('sleep')
    expect(item(/Wait 2 days/)).not.toHaveTextContent('In workflow.ts')
    expect(item(/Paid\?/)).toHaveTextContent('branch · 2 arms')
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

  it('creates a step after the chosen step from the header', async () => {
    loadGraph([irNode('a', 'A'), irNode('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Step name' })).toHaveFocus()
    await user.click(screen.getByRole('combobox', { name: 'Place it' }))
    await user.click(await screen.findByRole('option', { name: 'B' }))
    expect(screen.getByText('after B')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge card')
    expect(screen.getByText('Saved as steps/charge_card.ts')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'b' }, 'Charge card', 'charge_card'),
    )
    await waitFor(() => expect(useIdeStore.getState().editorFocusRequested).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('creates a step before a step from the header', async () => {
    loadGraph([irNode('a', 'A'), irNode('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.click(screen.getByRole('tab', { name: 'Before' }))
    await user.click(screen.getByRole('combobox', { name: 'Place it' }))
    await user.click(await screen.findByRole('option', { name: 'B' }))
    expect(screen.getByText('before B')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Before B')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith(
        { after: 'a', edgeId: 'e1' },
        'Before B',
        'before_b',
      ),
    )
  })

  it('picks a branch on the map', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.click(screen.getByRole('button', { name: /Pick on the map/ }))
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Into paid' }))
    expect(screen.getByText('Into paid')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith(
        { after: 'check', edgeId: 'e3' },
        'Charge',
        'charge_2',
      ),
    )
  })

  it('submits the map with Enter from the name field', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.click(screen.getByRole('button', { name: /Pick on the map/ }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Notify')
    expect(screen.getByText('steps/notify.ts')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'validate' }, 'Notify', 'notify'),
    )
  })

  it('opens the map on the active step’s branch', () => {
    useIdeStepsStore.getState().openPicker('check')
    setup()
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    expect(screen.getByText('Into paid')).toBeInTheDocument()
  })

  it('creates a step after a row-menu choice', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step after Validate order' }))
    await user.click(await screen.findByRole('menuitem', { name: 'New step after…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'After A')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'validate' }, 'After A', 'after_a'),
    )
  })

  it('creates in a branch from a row menu’s arm', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step after Paid?' }))
    await user.hover(screen.getByRole('menuitem', { name: /New step after/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Into paid' }))
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith(
        { after: 'check', edgeId: 'e3' },
        'Charge',
        'charge_2',
      ),
    )
  })

  it('makes the first step when the version has no nodes at all', async () => {
    loadGraph([], [])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByText('Where should it go?')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Start')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ first: true }, 'Start', 'start'),
    )
  })

  it('keeps the fast Insert disabled until a name is typed', async () => {
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), '   ')
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(onCreateStep).not.toHaveBeenCalled()
  })

  it('keeps a refusal in the dialog with the reason', async () => {
    const user = userEvent.setup()
    const onCreateStep = vi.fn(async () => ({
      status: 'refused' as const,
      reason: 'That step is not in this version any more.',
    }))
    render(
      <SyncHarness>
        <StepsView
          tabs={null}
          onEscape={vi.fn()}
          canEdit
          readOnlyMessage={null}
          onCreateStep={onCreateStep}
        />
      </SyncHarness>,
    )
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That step is not in this version any more.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(useIdeStepsStore.getState().picker).not.toBeNull()
  })

  it('cancels the dialog with Escape and reopens it fresh', async () => {
    loadGraph([irNode('a', 'A'), irNode('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const user = userEvent.setup()
    const { onCreateStep } = setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Draft')
    await user.click(screen.getByRole('tab', { name: 'Before' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useIdeStepsStore.getState().picker).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByRole('textbox', { name: 'Step name' })).toHaveValue('')
    expect(screen.getByRole('tab', { name: 'After' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('combobox', { name: 'Place it' })).toHaveTextContent('A')
    expect(onCreateStep).not.toHaveBeenCalled()
  })

  it('keeps a create open and ignores its result after a close attempt', async () => {
    const user = userEvent.setup()
    let resolveCreate: (outcome: { status: 'refused'; reason: string }) => void = () => {}
    const onCreateStep = vi.fn(
      () =>
        new Promise<{ status: 'refused'; reason: string }>((resolve) => {
          resolveCreate = resolve
        }),
    )
    render(
      <SyncHarness>
        <StepsView
          tabs={null}
          onEscape={vi.fn()}
          canEdit
          readOnlyMessage={null}
          onCreateStep={onCreateStep}
        />
      </SyncHarness>,
    )
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge')
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    expect(screen.getByRole('button', { name: 'Inserting…' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => {
      resolveCreate({ status: 'refused', reason: 'That connection is gone.' })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('That connection is gone.')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Step name' })).toHaveFocus())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('drops the dialog when the workspace turns read-only', async () => {
    const user = userEvent.setup()
    const ui = (canEdit: boolean) => (
      <SyncHarness>
        <StepsView
          tabs={null}
          onEscape={vi.fn()}
          canEdit={canEdit}
          readOnlyMessage={canEdit ? null : 'This version is read-only.'}
          onCreateStep={vi.fn(async () => ({
            status: 'created' as const,
            nodeId: 'new',
            path: 'steps/new.ts',
            opened: false,
          }))}
        />
      </SyncHarness>
    )
    const view = render(ui(true))
    await user.click(screen.getByRole('button', { name: 'New step' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    view.rerender(ui(false))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useIdeStepsStore.getState().picker).toBeNull()
  })

  it('explains when a step has no safe connection', async () => {
    loadGraph(
      [irNode('a', 'A'), irNode('b', 'B')],
      [
        { id: 'dup', source: 'a', target: 'b' },
        { id: 'dup', source: 'b', target: 'a' },
      ],
    )
    const user = userEvent.setup()
    useIdeStepsStore.getState().openPicker('b')
    setup()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/No step can take a new step on this side/)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Charge')
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('does not reuse a stored step path for the new file', async () => {
    loadGraph([irNode('a', 'A')], [])
    const user = userEvent.setup()
    const files = new Map([...FILES, ['steps/notify_ops.ts', { source: '' }]])
    const { onCreateStep } = setup({ files })
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.type(screen.getByRole('textbox', { name: 'Step name' }), 'Notify ops')
    expect(screen.getByText('Saved as steps/notify_ops_2.ts')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onCreateStep).toHaveBeenCalledWith({ after: 'a' }, 'Notify ops', 'notify_ops_2'),
    )
  })

  it('omits a shared-id before choice from the fast list', async () => {
    loadGraph(
      [irNode('a', 'A'), irNode('b', 'B'), irNode('c', 'C'), irNode('d', 'D')],
      [
        { id: 'dup', source: 'a', target: 'b' },
        { id: 'dup', source: 'c', target: 'd' },
      ],
    )
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.click(screen.getByRole('tab', { name: 'Before' }))
    await user.click(screen.getByRole('combobox', { name: 'Place it' }))
    expect(await screen.findByRole('option', { name: 'A' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'B' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'D' })).toBeNull()
  })

  it('shows the ghost on the map’s default position', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New step' }))
    await user.click(screen.getByRole('button', { name: /Pick on the map/ }))
    expect(screen.getByText('lands here')).toBeInTheDocument()
    expect(screen.getByText('After Validate order')).toBeInTheDocument()
  })

  it('toggles the canvas map from the header', async () => {
    useIdeLayoutStore.setState({ previewOpen: false })
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Show map' }))
    expect(useIdeLayoutStore.getState().previewOpen).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Hide map' }))
    expect(useIdeLayoutStore.getState().previewOpen).toBe(false)
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
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
