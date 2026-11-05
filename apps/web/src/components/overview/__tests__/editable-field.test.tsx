import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditableDescription, EditableName } from '../editable-field'

const update = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', () => ({ api: { updateWorkflow: update } }))

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  update.mockReset()
  update.mockResolvedValue(undefined)
})

describe('EditableName', () => {
  it('renames in place from the keyboard: Enter opens it, Enter saves', async () => {
    wrap(<EditableName workflowId="wf_1" initialValue="Lead enrichment" />)
    const heading = screen.getByRole('heading', { name: 'Lead enrichment' })
    screen.getByRole('button', { name: 'Lead enrichment' }).focus()
    await userEvent.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(heading).not.toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, ' Lead scoring {Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('wf_1', { name: 'Lead scoring' }))
    // Saved once: closing the field doesn't save again on blur.
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('keeps the name on Escape, or when it is left empty', async () => {
    wrap(<EditableName workflowId="wf_1" initialValue="Lead enrichment" />)
    await userEvent.click(screen.getByRole('button', { name: 'Lead enrichment' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'x{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Lead enrichment' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }))
    await userEvent.keyboard('{Enter}')
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Lead enrichment' })).toBeVisible()
  })
})

describe('read-only, for a viewer who can’t edit', () => {
  it('shows the name and description as plain text, nothing to click', () => {
    wrap(
      <>
        <EditableName workflowId="wf_1" initialValue="Lead enrichment" readOnly />
        <EditableDescription workflowId="wf_1" initialValue="Scores leads" readOnly />
        <EditableDescription workflowId="wf_2" initialValue="" readOnly />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Lead enrichment' })).toBeVisible()
    expect(screen.getByText('Scores leads')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // No "Add a description..." invitation either.
    expect(screen.queryByText('Add a description...')).not.toBeInTheDocument()
  })
})

describe('EditableDescription', () => {
  it('offers to add one, and saves what is typed', async () => {
    wrap(<EditableDescription workflowId="wf_1" initialValue="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add a description...' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Description' }),
      'Scores leads{Enter}',
    )
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('wf_1', { description: 'Scores leads' }),
    )
  })

  it('clears it when emptied (v1 kept the old text)', async () => {
    wrap(<EditableDescription workflowId="wf_1" initialValue="Scores leads" />)
    await userEvent.click(screen.getByRole('button', { name: 'Scores leads' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Description' }))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('wf_1', { description: '' }))
  })
})
