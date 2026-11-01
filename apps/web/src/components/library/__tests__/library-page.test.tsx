import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PRIYA,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { LibraryPage } from '../library-page'

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetDashboardData(new Date()))

describe('Library page', () => {
  it('draws WsLibrary’s two sections, empty until modules land', async () => {
    renderWithDashboardData(<LibraryPage slugs={sales} />)
    expect(await screen.findByRole('heading', { name: 'In Sales' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'From Project 101' })).toBeVisible()
    expect(screen.getByText(/No modules or custom nodes in Sales yet/)).toBeInTheDocument()
  })

  it('explains New module and New resource instead of a dead button', async () => {
    renderWithDashboardData(<LibraryPage slugs={sales} />)
    await screen.findByRole('heading', { name: 'In Sales' })
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    await userEvent.click(within(topBar).getByRole('button', { name: 'New module' }))
    const dialog = await screen.findByRole('dialog', { name: 'New module' })
    expect(dialog).toHaveTextContent('#modules/<name>')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(topBar).getByRole('button', { name: 'New resource' }))
    expect(await screen.findByRole('dialog', { name: 'New resource' })).toBeVisible()
  })

  it('shows a Viewer no New buttons', async () => {
    renderWithDashboardData(<LibraryPage slugs={sales} />, { userId: PRIYA })
    await screen.findByRole('heading', { name: 'In Sales' })
    expect(screen.queryByRole('button', { name: 'New module' })).not.toBeInTheDocument()
  })
})
