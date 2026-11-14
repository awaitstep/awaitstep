import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import type { SaveNodeFieldsOutcome } from '../../../lib/ide/step-create'
import { useNodeFieldDraftsStore } from '../../../stores/node-field-drafts-store'
import { NodeEditProvider } from '../node-edit-context'
import { NodeFieldsEditor } from '../node-fields-editor'
import { SAY_HELLO } from './fixtures/template-nodes'

function node(data: Record<string, unknown>): WorkflowNode {
  return {
    id: 'hello',
    type: 'custom:hello',
    name: 'Say hello',
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

function setup(
  data: Record<string, unknown>,
  options: { canEdit?: boolean; outcome?: SaveNodeFieldsOutcome } = {},
) {
  const saveNodeFields = vi.fn(
    (): SaveNodeFieldsOutcome => options.outcome ?? { status: 'recorded' },
  )
  const view = render(
    <NodeEditProvider canEdit={options.canEdit ?? true} saveNodeFields={saveNodeFields}>
      <NodeFieldsEditor workflowId="wf-1" node={node(data)} definition={SAY_HELLO} />
    </NodeEditProvider>,
  )
  function rerender(next: Record<string, unknown>) {
    view.rerender(
      <NodeEditProvider canEdit={options.canEdit ?? true} saveNodeFields={saveNodeFields}>
        <NodeFieldsEditor workflowId="wf-1" node={node(next)} definition={SAY_HELLO} />
      </NodeEditProvider>,
    )
  }
  return { saveNodeFields, rerender, unmount: view.unmount }
}

function targetInput() {
  return screen.getByDisplayValue('ops')
}

beforeEach(() => useNodeFieldDraftsStore.setState({ drafts: {}, errors: {} }))

describe('NodeFieldsEditor', () => {
  it('hands the changed fields to the pending edits, only when there is something to save', async () => {
    const user = userEvent.setup()
    const { saveNodeFields } = setup({ target: 'ops', greeting: 'Hi' })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(targetInput(), '-team')
    await user.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveNodeFields).toHaveBeenCalledWith(
        'hello',
        { target: 'ops-team', greeting: 'Hi', inline: true },
        { target: 'ops', greeting: 'Hi' },
      ),
    )
    expect(saveNodeFields).toHaveBeenCalledTimes(1)
    expect(useNodeFieldDraftsStore.getState().drafts).toEqual({})
  })

  it('saves with Enter right after typing', async () => {
    const user = userEvent.setup()
    const { saveNodeFields } = setup({ target: 'ops', greeting: 'Hi' })
    await user.type(targetInput(), 'x{Enter}')
    await waitFor(() =>
      expect(saveNodeFields).toHaveBeenCalledWith(
        'hello',
        { target: 'opsx', greeting: 'Hi' },
        { target: 'ops', greeting: 'Hi' },
      ),
    )
  })

  it('throws the draft away with Discard', async () => {
    const user = userEvent.setup()
    const { saveNodeFields } = setup({ target: 'ops', greeting: 'Hi' })
    await user.type(targetInput(), 'x')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByDisplayValue('ops')).toBeInTheDocument()
    expect(saveNodeFields).not.toHaveBeenCalled()
  })

  it('keeps a draft when the node is picked again, and drops it once the node was saved over', async () => {
    const user = userEvent.setup()
    const first = setup({ target: 'ops', greeting: 'Hi' })
    await user.type(targetInput(), 'x')
    await user.tab()
    first.unmount()
    const second = setup({ target: 'ops', greeting: 'Hi' })
    expect(screen.getByDisplayValue('opsx')).toBeInTheDocument()
    // The canvas saved new values for this node meanwhile.
    second.rerender({ target: 'sales', greeting: 'Hi' })
    expect(screen.getByDisplayValue('sales')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('marks an empty required field, and still lets it be saved', async () => {
    const user = userEvent.setup()
    const { saveNodeFields } = setup({ target: '', greeting: 'Hi' })
    expect(screen.getByText('Required')).toBeInTheDocument()
    await user.clear(screen.getByDisplayValue('Hi'))
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveNodeFields).toHaveBeenCalledWith(
        'hello',
        { target: '', greeting: '' },
        { target: '', greeting: 'Hi' },
      ),
    )
  })

  it('shows why a save was refused and keeps the draft', async () => {
    const user = userEvent.setup()
    setup(
      { target: 'ops', greeting: 'Hi' },
      { outcome: { status: 'refused', reason: 'That node is not in this version any more.' } },
    )
    await user.type(targetInput(), 'x')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That node is not in this version any more.',
    )
    expect(screen.getByDisplayValue('opsx')).toBeInTheDocument()
  })

  it('is read-only for someone who can’t edit', () => {
    setup({ target: 'ops', greeting: 'Hi' }, { canEdit: false })
    expect(targetInput()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('keeps a refusal’s error on its own node', async () => {
    const user = userEvent.setup()
    const saveNodeFields = vi.fn((): SaveNodeFieldsOutcome => ({
      status: 'refused',
      reason: 'Not here any more.',
    }))
    const other: WorkflowNode = { ...node({ target: 'b', greeting: 'Yo' }), id: 'other' }
    const view = render(
      <NodeEditProvider canEdit saveNodeFields={saveNodeFields}>
        <NodeFieldsEditor
          workflowId="wf-1"
          node={node({ target: 'ops', greeting: 'Hi' })}
          definition={SAY_HELLO}
        />
      </NodeEditProvider>,
    )
    await user.type(targetInput(), 'x')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    view.rerender(
      <NodeEditProvider canEdit saveNodeFields={saveNodeFields}>
        <NodeFieldsEditor workflowId="wf-1" node={other} definition={SAY_HELLO} />
      </NodeEditProvider>,
    )
    expect(useNodeFieldDraftsStore.getState().errors['wf-1:hello']).toBe('Not here any more.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('doesn’t show an unsaved draft where it can’t be saved (an older version, a viewer)', async () => {
    const user = userEvent.setup()
    const editable = setup({ target: 'ops', greeting: 'Hi' })
    await user.type(targetInput(), 'x')
    await user.tab()
    editable.unmount()
    setup({ target: 'ops', greeting: 'Hi' }, { canEdit: false })
    expect(screen.getByDisplayValue('ops')).toBeDisabled()
    expect(screen.queryByDisplayValue('opsx')).toBeNull()
  })
})
