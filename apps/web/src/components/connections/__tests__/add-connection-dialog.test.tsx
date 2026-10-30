import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../../../lib/api-client'
import { AddConnectionDialog } from '../add-connection-dialog'

// The token check's lockout (B7, SA-12) reaches the person as the API words it.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AddConnectionDialog', () => {
  it('shows the lockout’s wait when the token check is refused', async () => {
    vi.spyOn(api, 'verifyCredentials').mockRejectedValue(
      new ApiError('Too many failed token checks. Try again in 20 s.', 429),
    )
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AddConnectionDialog onClose={() => {}} />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Cloudflare/ }))
    await user.type(screen.getByPlaceholderText('Paste your Cloudflare API token'), 'x'.repeat(40))
    await user.click(screen.getByRole('button', { name: 'Verify & Continue' }))
    expect(
      await screen.findByText('Too many failed token checks. Try again in 20 s.'),
    ).toBeInTheDocument()
  })
})
