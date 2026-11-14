import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import { RouteError, routeErrorDetail } from '../route-error'

const invalidate = vi.fn(() => Promise.resolve())
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate }) }))

describe('routeErrorDetail', () => {
  it('says the server couldn’t be reached for a network failure', () => {
    expect(routeErrorDetail(new TypeError('fetch failed'))).toBe(
      'We couldn’t reach the server. Check your connection, then try again.',
    )
    expect(routeErrorDetail(new Error('fetch failed'))).toMatch(/couldn’t reach the server/)
  })

  it('shows a 4xx reason, and a general line for a 5xx', () => {
    expect(routeErrorDetail(new ApiError('Workflow not found', 404))).toBe('Workflow not found')
    expect(routeErrorDetail(new ApiError('boom: stack…', 500))).toBe(
      'The server ran into a problem. Nothing was changed.',
    )
    expect(routeErrorDetail(new ApiError('Request failed (404)', 404, { hasReason: false }))).toBe(
      'The server ran into a problem. Nothing was changed.',
    )
  })

  it('never shows an unknown error’s raw message', () => {
    expect(routeErrorDetail(new Error('Cannot read properties of undefined'))).toBe(
      'Something unexpected went wrong. Nothing was changed.',
    )
  })
})

describe('RouteError', () => {
  it('shows the card, and Try again resets and reloads the route', async () => {
    const reset = vi.fn()
    render(
      <RouteError
        error={new ApiError('Workflow not found', 404, { requestId: 'req_1' })}
        reset={reset}
        info={{ componentStack: '' }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'We couldn’t load this page' })).toBeInTheDocument()
    expect(screen.getByText('Workflow not found')).toBeInTheDocument()
    expect(screen.getByText('req_1')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalled()
  })
})
