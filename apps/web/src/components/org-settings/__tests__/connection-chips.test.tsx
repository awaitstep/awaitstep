import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import type * as OrgSettingsHooks from '../../../data/dashboard/org-settings'
import { OrgConnectionsPage } from '../org-connections-page'

// A chip change sends the whole project list read from the cache: while one
// is on its way, another would send a list without it (B9 code review).

const mutate = vi.fn()
const pending = { isPending: true }

vi.mock('../../../data/dashboard/org-settings', async (importOriginal) => {
  const real = await importOriginal<typeof OrgSettingsHooks>()
  return {
    ...real,
    useUpdateConnection: () => ({ ...pending, mutate, reset: vi.fn(), error: null }),
  }
})
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

function Connections() {
  const [open, setOpen] = useState(false)
  return <OrgConnectionsPage org="acme" connectOpen={open} onConnectChange={setOpen} />
}

beforeEach(() => {
  resetDashboardData(new Date())
  mutate.mockReset()
})

describe('project chips while a change is on its way', () => {
  it('waits rather than sending a list without the first change', async () => {
    renderWithDashboardData(<Connections />)
    const production = await screen.findByRole('region', { name: 'Acme production' })
    await userEvent.click(
      within(production).getByRole('button', { name: 'Remove Project 101 from Acme production' }),
    )
    expect(mutate).not.toHaveBeenCalled()
  })

  it('sends the change once nothing else is on its way', async () => {
    pending.isPending = false
    try {
      renderWithDashboardData(<Connections />)
      const production = await screen.findByRole('region', { name: 'Acme production' })
      await userEvent.click(
        within(production).getByRole('button', { name: 'Remove Project 101 from Acme production' }),
      )
      expect(mutate).toHaveBeenCalledWith({
        connectionId: expect.any(String),
        update: { projects: [expect.not.stringMatching(/project-101/)] },
      })
    } finally {
      pending.isPending = true
    }
  })
})
