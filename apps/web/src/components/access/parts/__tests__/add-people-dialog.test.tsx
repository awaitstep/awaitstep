import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Person } from '../../../../types/dashboard/session'
import { AddPeopleDialog, MAX_PICKS } from '../add-people-dialog'
import type { PoolPerson } from '../people-pool'

const ctx = {
  kind: 'workspace' as const,
  orgName: 'Acme Inc',
  projectName: 'Project 101',
  roleLabel: 'Editor',
  where: 'Sales',
}

function person(i: number): PoolPerson {
  const p: Person = {
    id: `p${i}`,
    name: `Person ${i}`,
    email: `p${i}@acme.test`,
    initials: 'P',
    image: null,
  }
  return { person: p, tier: 'project', note: 'In Project 101', joins: false }
}

function renderDialog(
  pool: PoolPerson[],
  poolState?: Parameters<typeof AddPeopleDialog>[0]['poolState'],
) {
  render(
    <AddPeopleDialog
      title="Add people to Sales"
      description="Pick people"
      searchLabel="Search or type an email"
      pool={pool}
      canInvite
      poolState={poolState}
      access={null}
      ctx={ctx}
      pending={false}
      outcomes={undefined}
      onSubmit={vi.fn()}
      onReset={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  return screen.getByRole('dialog', { name: 'Add people to Sales' })
}

describe('AddPeopleDialog', () => {
  it('keeps a typed address at the pick cap instead of dropping it', async () => {
    const dialog = renderDialog(Array.from({ length: MAX_PICKS }, (_, i) => person(i)))
    for (const option of within(dialog).getAllByRole('option')) await userEvent.click(option)
    expect(within(dialog).getByText(`${MAX_PICKS} selected · ${MAX_PICKS} at a time`)).toBeVisible()
    const search = within(dialog).getByRole('searchbox')
    await userEvent.type(search, 'new@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: /Invite new@example\.test/ }))
    expect(search).toHaveValue('new@example.test')
    expect(within(dialog).queryByRole('button', { name: 'Remove new@example.test' })).toBeNull()
  })

  it('says the people are loading, never that nobody matches', () => {
    const dialog = renderDialog([], { status: 'loading' })
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading people…')
    expect(within(dialog).queryByText(/Nobody matches/)).toBeNull()
  })

  it('says the people didn’t load, with a way to try again', async () => {
    const onRetry = vi.fn()
    const dialog = renderDialog([], { status: 'error', onRetry })
    const alert = within(dialog).getByRole('alert')
    expect(alert).toHaveTextContent('We couldn’t load the people to pick from.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
