import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dashboardServer,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { useNewItem } from '../use-new-item'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
  vi.restoreAllMocks()
})

function NewWorkflow({ blank }: { blank?: boolean }) {
  const newItem = useNewItem(sales, { blank })
  function handleClick() {
    newItem.start('workflow')
  }
  return (
    <button onClick={handleClick} disabled={newItem.busy}>
      New workflow
    </button>
  )
}

describe('useNewItem', () => {
  it('opens the editor even when the button is gone before the create answers', async () => {
    // An empty state ends as the lists refetch, taking its button with it.
    let answer!: (item: WorkspaceItem) => void
    const real = dashboardServer.items.createItem
    vi.spyOn(dashboardServer.items, 'createItem').mockImplementation((...args) =>
      real(...args).then(
        (item) => new Promise<WorkspaceItem>((resolve) => (answer = () => resolve(item))),
      ),
    )
    const view = renderWithDashboardData(<NewWorkflow />)
    await userEvent.click(screen.getByRole('button', { name: 'New workflow' }))
    await waitFor(() => expect(answer).toBeDefined())
    view.unmount()
    await act(async () => answer({} as WorkspaceItem))
    await waitFor(() =>
      expect(goTo).toHaveBeenCalledWith(
        expect.stringMatching(/^\/acme\/project-101\/sales\/workflows\/[^/?]+\?template=1$/),
      ),
    )
  })

  it('stays busy once created, and a blank start opens without templates', async () => {
    renderWithDashboardData(<NewWorkflow blank />)
    const button = screen.getByRole('button', { name: 'New workflow' })
    await userEvent.click(button)
    await waitFor(() => expect(goTo).toHaveBeenCalledTimes(1))
    expect(goTo).toHaveBeenCalledWith(
      expect.stringMatching(/^\/acme\/project-101\/sales\/workflows\/[^/?]+$/),
    )
    // Still mounted: the success latch, not a pending render, keeps it disabled.
    await waitFor(() => expect(button).toBeDisabled())
  })
})
