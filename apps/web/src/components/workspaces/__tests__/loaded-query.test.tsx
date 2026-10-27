import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseQueryResult } from '@tanstack/react-query'
import { LoadedQuery } from '../loaded-query'

function query(state: Partial<UseQueryResult<string[]>>): UseQueryResult<string[]> {
  return {
    data: undefined,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...state,
  } as UseQueryResult<string[]>
}

function renderList(state: Partial<UseQueryResult<string[]>>, filters?: boolean) {
  render(
    <LoadedQuery query={query(state)} what="nodes" filters={filters}>
      {(data) => <p>{data.join(', ')}</p>}
    </LoadedQuery>,
  )
}

describe('LoadedQuery', () => {
  it('shows its data once loaded', () => {
    renderList({ data: ['Slack', 'Stripe'] })
    expect(screen.getByText('Slack, Stripe')).toBeVisible()
  })

  it('names what is loading', () => {
    renderList({}, true)
    expect(screen.getByRole('status')).toHaveTextContent('Loading nodes')
  })

  it('shows the error card, and retries the query', async () => {
    const refetch = vi.fn()
    render(
      <LoadedQuery query={query({ isError: true, error: new Error('Down'), refetch })} what="nodes">
        {() => <p>never</p>}
      </LoadedQuery>,
    )
    expect(screen.getByText(/We couldn’t load nodes/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(refetch).toHaveBeenCalled()
  })
})
