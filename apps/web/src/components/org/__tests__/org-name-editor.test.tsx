import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const update = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth-client', () => ({ authClient: { organization: { update } } }))

import type { Organization } from '../../../stores/org-store'
import { OrgNameEditor } from '../org-name-editor'

const org = { id: 'o1', name: 'Acme', slug: 'acme' } as Organization

describe('OrgNameEditor', () => {
  it('starts a new edit without the last failure', async () => {
    update.mockResolvedValueOnce({ error: { message: 'That name is taken', status: 409 } })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrgNameEditor org={org} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByText('Acme'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'Globex{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken')

    // Edit again and back out: the old failure is gone.
    await userEvent.click(screen.getByText('Acme'))
    await userEvent.type(screen.getByRole('textbox'), '{Escape}')
    expect(screen.getByText('Acme')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
