import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stepModuleTemplate } from '@awaitstep/codegen'
import type { RemoveNodeOutcome } from '../../../lib/ide/step-remove'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeStepsStore } from '../../../stores/ide-steps-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { RemoveNodeDialog } from '../remove-node-dialog'
import { StepsView } from '../steps-view'
import { EDGES, irNode, loadGraph, NODES, SyncHarness } from './fixtures/step-sync'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: toastError, info: vi.fn() },
}))
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => vi.fn() }))
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { get: () => undefined }, customNodes: new Map() }),
}))

function setup(
  options: {
    canEdit?: boolean
    outcome?: RemoveNodeOutcome
  } = {},
) {
  const { canEdit = true, outcome } = options
  const onRemove = vi.fn(
    (nodeId: string): RemoveNodeOutcome => outcome ?? { status: 'removed', nodeId },
  )
  render(
    <SyncHarness>
      <StepsView
        tabs={<span>tabs</span>}
        onEscape={vi.fn()}
        canEdit={canEdit}
        readOnlyMessage={canEdit ? null : 'Older versions are read-only.'}
        onCreateStep={vi.fn()}
        onUndoGraphEdit={vi.fn(() => false)}
      />
      <RemoveNodeDialog onRemove={onRemove} />
    </SyncHarness>,
  )
  return { onRemove, user: userEvent.setup() }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `Step actions for ${name}` }))
}

beforeEach(() => {
  toastError.mockClear()
  useIdeStore.getState().resetSession()
  useIdeStepsStore.getState().reset()
  useIdeLayoutStore.setState({ sideBarTab: 'steps' })
  useWorkflowStore.getState().reset()
  loadGraph()
})

describe('Remove from the Steps row menu', () => {
  it('opens the dialog, and Remove removes that node', async () => {
    const { onRemove, user } = setup()
    await openMenu(user, 'Charge card')
    await user.click(await screen.findByRole('menuitem', { name: 'Remove…' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Remove Charge card?')
    expect(dialog).toHaveTextContent('The steps around it are joined when you save.')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('charge'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('says in a toast why a branch can’t be removed here, without a dialog', async () => {
    const { onRemove, user } = setup()
    await openMenu(user, 'Paid?')
    const remove = await screen.findByRole('menuitem', { name: 'Remove…' })
    expect(remove).not.toHaveAttribute('aria-disabled')
    await user.click(remove)
    expect(toastError).toHaveBeenCalledWith('Remove it on the canvas — its arms need placing.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('says in a toast why the only node can’t be removed', async () => {
    loadGraph([irNode('only', 'Only')], [])
    const { user } = setup()
    await openMenu(user, 'Only')
    await user.click(await screen.findByRole('menuitem', { name: 'Remove…' }))
    expect(toastError).toHaveBeenCalledWith(
      'A workflow needs at least one node. Add another first.',
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('removes an arm’s first node that leads into a join; the save answers why not', async () => {
    // Paid? —paid→ ship → wait and Paid? —late→ wait: removing ship sends the
    // paid arm straight into wait. Code records it; the save's validation refuses it.
    loadGraph(NODES, [
      ...EDGES.filter((edge) => edge.id !== 'e3'),
      { id: 'e3', source: 'check', target: 'ship', label: 'paid' },
      { id: 'e5', source: 'ship', target: 'wait' },
    ])
    const { onRemove, user } = setup()
    await openMenu(user, 'Ship order')
    const remove = await screen.findByRole('menuitem', { name: 'Remove…' })
    expect(remove).not.toHaveAttribute('aria-disabled')
    await user.click(remove)
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith('ship')
    expect(toastError).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('leaves the menu disabled for a viewer', () => {
    setup({ canEdit: false })
    expect(screen.getByRole('button', { name: 'Step actions for Charge card' })).toBeDisabled()
  })

  it('Cancel writes nothing', async () => {
    const { onRemove, user } = setup()
    useIdeStore.getState().showDialog('removeNode', 'charge')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onRemove).not.toHaveBeenCalled()
    expect(useIdeStore.getState().dialog).toBeNull()
  })
})

describe('RemoveNodeDialog', () => {
  it('names the steps that read the node’s value, and what they read', async () => {
    loadGraph(
      [
        irNode('hello', 'say hello', 'custom:hello'),
        irNode('notify', 'notify', 'custom:notify', { message: 'Hi {{say_hello.result}}' }),
        irNode('mail', 'mail', 'step', {
          code: `export default async function mail({ inputs }) {\n  return inputs.say_hello\n}\n`,
        }),
      ],
      [
        { id: 'a', source: 'hello', target: 'notify' },
        { id: 'b', source: 'notify', target: 'mail' },
      ],
    )
    setup()
    useIdeStore.getState().showDialog('removeNode', 'hello')
    const dialog = await screen.findByRole('alertdialog')
    const errors = within(dialog).getByRole('list', { name: 'Will error' })
    expect(within(errors).getByText('notify')).toHaveAttribute(
      'title',
      'message: {{say_hello.result}}',
    )
    expect(within(errors).getByText('mail')).toHaveAttribute('title', 'code: inputs.say_hello')
  })

  it('says which names move and which arm is left empty', async () => {
    loadGraph(
      [
        irNode('s1', 'sample step', 'step', { code: stepModuleTemplate('sample_step') }),
        irNode('gate', 'Gate', 'branch'),
        irNode('s2', 'sample step', 'step', { code: stepModuleTemplate('sample_step_2') }),
      ],
      [
        { id: 'a', source: 's1', target: 'gate' },
        { id: 'b', source: 'gate', target: 's2', label: 'yes' },
      ],
    )
    setup()
    useIdeStore.getState().showDialog('removeNode', 's1')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('list', { name: 'Renamed' })).toHaveTextContent(
      'sample_step_2 → sample_step',
    )

    useIdeStore.getState().showDialog('removeNode', 's2')
    await waitFor(() => expect(screen.getByRole('alertdialog')).toHaveTextContent('Gate · yes'))
  })

  it('warns that the step’s unsaved changes will be discarded', async () => {
    setup()
    useIdeStore.getState().setDraft('steps/charge.ts', 'changed', null)
    useIdeStore.getState().showDialog('removeNode', 'charge')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('list', { name: 'Unsaved changes lost' })).toHaveTextContent(
      'steps/charge.ts',
    )
  })

  it('toasts the reason and closes when the remove fails', async () => {
    const { user } = setup({ outcome: { status: 'failed', reason: 'Couldn’t remove Charge card' } })
    useIdeStore.getState().showDialog('removeNode', 'charge')
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Couldn’t remove Charge card', undefined),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the live graph when reopened after a failed remove', async () => {
    const { user } = setup({ outcome: { status: 'failed', reason: 'Couldn’t remove Charge card' } })
    useIdeStore.getState().showDialog('removeNode', 'charge')
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    act(() => loadGraph([irNode('charge', 'Charge card')], []))
    act(() => useIdeStore.getState().showDialog('removeNode', 'charge'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('A workflow needs at least one node. Add another first.')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('shows a blocked node’s reason with Remove disabled', async () => {
    loadGraph([irNode('only', 'Only')], [])
    setup()
    useIdeStore.getState().showDialog('removeNode', 'only')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('A workflow needs at least one node. Add another first.')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('says when readers will read the renamed node instead of breaking', async () => {
    loadGraph(
      [
        irNode('s1', 'sample step'),
        irNode('s2', 'sample step'),
        irNode('n', 'notify', 'custom:n', { message: '{{sample_step.result}}' }),
      ],
      [
        { id: 'a', source: 's1', target: 's2' },
        { id: 'b', source: 's2', target: 'n' },
      ],
    )
    setup()
    useIdeStore.getState().showDialog('removeNode', 's1')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('list', { name: 'Will read sample step' })).toHaveTextContent(
      'notify',
    )
    expect(within(dialog).queryByRole('list', { name: 'Will error' })).not.toBeInTheDocument()
  })

  it('shows at most 20 reading steps, then how many more', async () => {
    const readers = Array.from({ length: 25 }, (_, i) =>
      irNode(`n${i}`, `notify ${i}`, 'custom:n', { message: '{{say_hello.x}}' }),
    )
    loadGraph(
      [irNode('hello', 'say hello', 'custom:hello'), ...readers],
      readers.map((reader, i) => ({
        id: `e${i}`,
        source: i === 0 ? 'hello' : `n${i - 1}`,
        target: reader.id,
      })),
    )
    setup()
    useIdeStore.getState().showDialog('removeNode', 'hello')
    const dialog = await screen.findByRole('alertdialog')
    const chips = within(within(dialog).getByRole('list', { name: 'Will error' })).getAllByRole(
      'listitem',
    )
    expect(chips).toHaveLength(21)
    expect(chips.at(-1)).toHaveTextContent('+5')
  })
})
