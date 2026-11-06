import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorAccessProvider, type EditorAccess } from '../../../contexts/editor-scope-context'
import { ApiError } from '../../../lib/api-client'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { EnvVarsDialog } from '../env-vars-dialog'

const api = vi.hoisted(() => ({ updateWorkflow: vi.fn() }))
const stored = vi.hoisted(() => ({
  envVars: '' as string | null,
  ir: null as string | null,
  fullFetches: 0,
}))
const STORED_VARS = JSON.stringify([
  { name: 'TOKEN', value: '••••••••', isSecret: true },
  { name: 'REGION', value: 'eu', isSecret: false },
])

vi.mock('../../../contexts/api-client-context', () => ({
  useApi: () => api,
  useApiReady: () => true,
  useQueries: () => ({
    workflows: {
      detail: (id: string) => ({
        queryKey: ['workflow', id],
        queryFn: () => Promise.resolve({ id, envVars: stored.envVars }),
      }),
      full: (id: string) => ({
        queryKey: ['workflow-full', id, undefined],
        queryFn: () => {
          stored.fullFetches += 1
          return Promise.resolve({ version: stored.ir ? { ir: stored.ir } : null })
        },
      }),
    },
  }),
}))

const EDITOR: EditorAccess = {
  canEdit: true,
  canDeploy: true,
  canShare: false,
  canMove: false,
  reason: null,
}
const VIEWER: EditorAccess = { ...EDITOR, canEdit: false, reason: 'You can view this workflow.' }

const client = { current: new QueryClient() }

function Harness({ access }: { access: EditorAccess }) {
  const [open, setOpen] = useState(true)
  return (
    <QueryClientProvider client={client.current}>
      <EditorAccessProvider value={access}>
        <EnvVarsDialog workflowId="wf_1" open={open} onOpenChange={setOpen} />
        {!open && <p>closed</p>}
      </EditorAccessProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client.current = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  stored.envVars = STORED_VARS
  stored.ir = null
  stored.fullFetches = 0
  api.updateWorkflow.mockReset()
  api.updateWorkflow.mockResolvedValue({})
  useWorkflowStore.getState().reset()
})

describe('EnvVarsDialog', () => {
  it('lists what is stored, a secret as a masked field', async () => {
    render(<Harness access={EDITOR} />)
    expect(await screen.findByDisplayValue('SECRET_TOKEN')).toBeInTheDocument()
    expect(screen.getByDisplayValue('REGION')).toBeInTheDocument()
    expect(screen.getByDisplayValue('••••••••')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves only the variables, closes, and keeps the canvas store in step without a dirty mark', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.click(screen.getByRole('button', { name: /Add/ }))
    const names = screen.getAllByLabelText('Variable name')
    await user.type(names[2]!, 'my_flag')
    await user.type(screen.getAllByLabelText('Value')[2]!, 'on')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument())
    expect(api.updateWorkflow).toHaveBeenCalledWith('wf_1', {
      envVars: [
        { name: 'TOKEN', isSecret: true, value: '••••••••' },
        { name: 'REGION', isSecret: false, value: 'eu' },
        { name: 'MY_FLAG', isSecret: false, value: 'on' },
      ],
      // What was read, so a change made meanwhile by someone else is refused, not overwritten.
      envVarsBase: STORED_VARS,
    })
    expect(useWorkflowStore.getState().workflowEnvVars.map((v) => v.name)).toEqual([
      'SECRET_TOKEN',
      'REGION',
      'MY_FLAG',
    ])
    expect(useWorkflowStore.getState().isDirty).toBe(false)
  })

  it('refuses a name used twice, in words, and does not save', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.click(screen.getByRole('button', { name: /Add/ }))
    await user.type(screen.getAllByLabelText('Variable name')[2]!, 'region')
    expect(screen.getByText(/“REGION” is used more than once/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it('stays open and says why when the server refuses', async () => {
    api.updateWorkflow.mockRejectedValue(new ApiError('This workspace is locked', 423))
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.clear(screen.getByDisplayValue('eu'))
    await user.type(screen.getAllByLabelText('Value')[1]!, 'us')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This workspace is locked')).toBeVisible()
    expect(screen.queryByText('closed')).toBeNull()
  })

  it('lets a Viewer read, with the reason, and offers nothing to change', async () => {
    render(<Harness access={VIEWER} />)
    expect(await screen.findByDisplayValue('REGION')).toBeDisabled()
    expect(screen.getByText('You can view this workflow.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('the link button points a variable at the global one of that name, and again takes it away', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.click(screen.getAllByRole('button', { name: 'Link to global' })[1]!)
    expect(screen.getByText('Global')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Unlink from global' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('1 encrypted · 1 linked')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Unlink from global' }))
    expect(screen.queryByText('Global')).toBeNull()
    expect(screen.getAllByLabelText('Value')[1]).toHaveValue('')
  })

  it('groups what is stored: needs a value first, then secrets, then variables, with counts', async () => {
    stored.envVars = JSON.stringify([
      { name: 'REGION', value: 'eu', isSecret: false },
      { name: 'WEBHOOK_URL', value: '', isSecret: false },
      { name: 'STRIPE', value: '••••••••', isSecret: true },
    ])
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    const sections = screen.getAllByRole('region').map((el) => el.getAttribute('aria-label'))
    expect(sections).toEqual(['attention', 'secrets', 'variables'])
    expect(screen.getByText('Needs attention')).toBeVisible()
    expect(screen.getByText('Encrypted')).toBeVisible()
    expect(screen.getByPlaceholderText('Needs a value')).toBeVisible()
    expect(screen.getByText('1 encrypted · 1 needs a value')).toBeVisible()
  })

  it('keeps a row where it is while its name is typed, so the field keeps focus', async () => {
    stored.envVars = JSON.stringify([{ name: 'REGION', value: 'eu', isSecret: false }])
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.click(screen.getByRole('button', { name: 'Add variable' }))
    const names = screen.getAllByLabelText('Variable name')
    await user.type(names[1]!, 'secret_abc')
    expect(names[1]).toHaveFocus()
    expect(screen.getAllByLabelText('Variable name')[1]).toBe(names[1])
  })

  it('reveals a typed secret on request, and never offers to reveal the stored mask', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('SECRET_TOKEN')
    expect(screen.queryByRole('button', { name: 'Reveal value' })).toBeNull()
    await user.clear(screen.getAllByLabelText('Value')[0]!)
    await user.type(screen.getAllByLabelText('Value')[0]!, 'abc')
    const input = screen.getAllByLabelText('Value')[0]!
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Reveal value' }))
    expect(input).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide value' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('shows what variables are for when there are none, with both ways to start', async () => {
    stored.envVars = null
    render(<Harness access={EDITOR} />)
    expect(await screen.findByText('No variables yet')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Import from .env' })).toBeVisible()
  })

  it('adds the variables of a .env file, secrets included, and says what it left out', async () => {
    stored.envVars = JSON.stringify([{ name: 'REGION', value: 'eu', isSecret: false }])
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    const file = new File(['REGION=us\nSECRET_KEY=abc\nnot a line\n'], '.env', {
      type: 'text/plain',
    })
    await user.upload(screen.getByLabelText('Import a .env file'), file)
    expect(await screen.findByDisplayValue('SECRET_KEY')).toBeInTheDocument()
    expect(
      screen.getByText(/Added 1 variable; left out 1 line it couldn’t read and 1 already defined/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('stays open and says so when someone else saved variables meanwhile (409)', async () => {
    api.updateWorkflow.mockRejectedValue(
      new ApiError('Something changed meanwhile. Reload and try again', 409),
    )
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.type(screen.getAllByLabelText('Value')[1]!, '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Something changed meanwhile/)).toBeVisible()
    expect(screen.queryByText('closed')).toBeNull()
  })

  it('does not refetch the editor’s own query or add an undo step, so the canvas keeps its drawing', async () => {
    const user = userEvent.setup()
    useWorkflowStore.setState({ isDirty: true })
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    const before = stored.fullFetches
    const undoSteps = useWorkflowStore.temporal.getState().pastStates.length
    await user.type(screen.getAllByLabelText('Value')[1]!, '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument())
    expect(stored.fullFetches).toBe(before)
    expect(client.current.getQueryState(['workflow-full', 'wf_1', undefined])?.isInvalidated).toBe(
      true,
    )
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(undoSteps)
    expect(useWorkflowStore.getState().isDirty).toBe(true)
  })

  it('asks for the value again when a masked secret is renamed, and does not save', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    const name = await screen.findByDisplayValue('SECRET_TOKEN')
    await user.type(name, '_2')
    expect(screen.getByText(/Type the value for “SECRET_TOKEN_2” again/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.clear(screen.getAllByLabelText('Value')[0]!)
    await user.type(screen.getAllByLabelText('Value')[0]!, 'fresh')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('starts from the names a version declares when nothing is stored (an import)', async () => {
    stored.envVars = null
    stored.ir = JSON.stringify({
      runtime: { env: [{ name: 'FOO' }, { name: 'KEY', secret: true }] },
    })
    render(<Harness access={EDITOR} />)
    expect(await screen.findByDisplayValue('FOO')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SECRET_KEY')).toBeInTheDocument()
    // Declared names carry no value: each needs one before it can be stored.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText(/“FOO” needs a value/)).toBeVisible()
  })

  it('treats a space before SECRET_ as the prefix, and strips spaces from names', async () => {
    stored.envVars = null
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await user.click(await screen.findByRole('button', { name: /Add/ }))
    await user.type(screen.getByLabelText('Variable name'), ' secret_api key')
    expect(screen.getByLabelText('Variable name')).toHaveValue('SECRET_APIKEY')
    expect(screen.getByLabelText('Value')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Value')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('does not close on an outside click while something is typed, but does when nothing is', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.type(screen.getAllByLabelText('Value')[1]!, '2')
    // The overlay is the outside; the dialog makes the page itself unclickable.
    const overlay = screen.getByRole('dialog').previousElementSibling as HTMLElement
    await userEvent.setup({ pointerEventsCheck: 0 }).click(overlay)
    expect(screen.queryByText('closed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  it('does not save a variable that has a name but no value once trimmed, and says which', async () => {
    const user = userEvent.setup()
    render(<Harness access={EDITOR} />)
    await screen.findByDisplayValue('REGION')
    await user.click(screen.getByRole('button', { name: 'Add variable' }))
    await user.type(screen.getAllByLabelText('Variable name')[2]!, 'some')
    await user.type(screen.getAllByLabelText('Value')[2]!, '   ')
    expect(screen.getByText(/“SOME” needs a value/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(screen.getAllByLabelText('Value')[2]!, 'x')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
