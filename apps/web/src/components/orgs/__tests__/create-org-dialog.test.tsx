import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateOrgDialog } from '../create-org-dialog'

const create = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const goTo = vi.hoisted(() => vi.fn())

vi.mock('../../../data/dashboard/session', () => ({ useCreateOrg: () => create }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

afterEach(() => {
  create.mutate.mockReset()
  create.reset.mockReset()
  create.error = null
  goTo.mockReset()
})

function renderDialog() {
  return render(<CreateOrgDialog open onOpenChange={vi.fn()} />)
}

describe('CreateOrgDialog', () => {
  it('shows the URL the name makes, creates, and lands on the new org’s home', async () => {
    create.mutate.mockImplementation((_name, opts) => opts.onSuccess({ slug: 'globex-labs' }))
    renderDialog()
    await userEvent.type(screen.getByRole('textbox', { name: /Organization name/ }), 'Globex Labs')
    expect(screen.getByText('URL: awaitstep.dev/globex-labs')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(create.mutate).toHaveBeenCalledWith('Globex Labs', expect.any(Object))
    expect(goTo).toHaveBeenCalledWith('/globex-labs/projects')
  })

  it('refuses a name whose URL is a page of the app before asking the server', async () => {
    renderDialog()
    await userEvent.type(screen.getByRole('textbox', { name: /Organization name/ }), 'Dashboard')
    expect(screen.getByText('“dashboard” is a page of AwaitStep. Pick another name.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create organization' })).toBeDisabled()
    expect(create.mutate).not.toHaveBeenCalled()
  })

  it('shows the server’s refusal, and needs a name with a letter or number', async () => {
    create.error = new Error('Organization slug already exists')
    renderDialog()
    expect(screen.getByText('Organization slug already exists')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create organization' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: /Organization name/ }), '!!')
    expect(create.reset).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create organization' })).toBeDisabled()
  })
})
