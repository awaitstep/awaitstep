import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { StepsView } from '../steps-view'
import { loadGraph, SyncHarness } from './fixtures/step-sync'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined } }),
}))

function setup(props: Partial<Parameters<typeof SyncHarness>[0]> = {}) {
  const onEscape = vi.fn()
  render(
    <SyncHarness {...props}>
      <StepsView tabs={<span>tabs</span>} onEscape={onEscape} />
    </SyncHarness>,
  )
  return { onEscape }
}

const item = (name: RegExp | string) => screen.getByRole('treeitem', { name })

beforeEach(() => {
  useIdeStore.getState().resetSession()
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

  it('tells a function’s author that steps have no files, and links nothing', async () => {
    setup({ manifest: null, kind: 'script' })
    expect(screen.getByText(/A function has no step files/)).toBeInTheDocument()
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
})
