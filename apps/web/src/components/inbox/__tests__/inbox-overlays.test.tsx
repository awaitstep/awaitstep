import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { DashboardOverlays } from '../dashboard-overlays'
import { sinceLastVisit } from '../whats-new-sheet'

beforeEach(() => resetDashboardData(new Date()))

/** Ama's last What's new visit in the seed. */
const SEEDED_VISIT = '2026-10-29T12:00:00.000Z'
const amaVisit = () => dashboardDb().releaseVisits.find((v) => v.userId === 'usr_ama')!.at
const inbox = () => screen.getByRole('dialog', { name: 'Notifications' })
const rows = () => within(inbox()).getAllByRole('listitem')
const show = (name: RegExp) =>
  within(within(inbox()).getByRole('group', { name: 'Show' })).getByRole('button', { name })

function renderOverlay(open: string, onClose = vi.fn()) {
  renderWithDashboardData(<DashboardOverlays org="acme" open={open} onClose={onClose} />)
  return onClose
}

describe('Inbox', () => {
  it('reads as Notifications: six rows, three unread, four needing action', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    expect(rows()).toHaveLength(6)
    expect(show(/All/)).toHaveTextContent('6')
    expect(show(/Unread/)).toHaveTextContent('3')
    expect(show(/Needs action/)).toHaveTextContent('4')
    expect(within(rows()[0]!).getByRole('link', { name: /See runs/ })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/runs',
    )
    expect(rows()[1]).toHaveTextContent('Priya Shah asked for edit access to Sales')
    expect(within(inbox()).getAllByRole('img', { name: 'Unread' })).toHaveLength(3)
    expect(inbox()).toHaveTextContent('Failures and edit-access requests are also emailed to you.')
  })

  it('narrows by the Show pills', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(show(/Needs action/))
    expect(rows()).toHaveLength(4)
    await userEvent.click(show(/Unread/))
    expect(rows()).toHaveLength(3)
  })

  it('marks a row read when its link is followed, and all with Mark all as read', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(within(rows()[0]!).getByRole('link', { name: /See runs/ }))
    await waitFor(() => expect(show(/Unread/)).toHaveTextContent('2'))
    await userEvent.click(within(inbox()).getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() =>
      expect(within(inbox()).queryAllByRole('img', { name: 'Unread' })).toHaveLength(0),
    )
    expect(within(inbox()).getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })

  it('approves Priya’s request: she becomes an Editor in Sales', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(within(rows()[1]!).getByRole('button', { name: 'Approve' }))
    expect(await within(inbox()).findByRole('status')).toHaveTextContent(
      'Approved. Priya is now an Editor in Sales.',
    )
    expect(
      dashboardDb().workspaceMembers.find(
        (m) => m.workspaceId === 'ws_sales' && m.userId === 'usr_priya',
      )!.role,
    ).toBe('editor')
  })

  it('keeps an answered request in view under Needs action, its outcome focused', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(show(/Needs action/))
    await userEvent.click(within(inbox()).getByRole('button', { name: 'Approve' }))
    const outcome = await within(inbox()).findByRole('status')
    expect(outcome).toHaveTextContent('Approved. Priya is now an Editor in Sales.')
    expect(outcome).toHaveFocus()
  })

  it('declines Priya’s request and says she was told', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(within(rows()[1]!).getByRole('button', { name: 'Decline' }))
    expect(await within(inbox()).findByRole('status')).toHaveTextContent(
      'Declined. Priya was told.',
    )
  })

  it('says you’re all caught up when there’s nothing', async () => {
    renderWithDashboardData(<DashboardOverlays org="acme" open="inbox" onClose={vi.fn()} />, {
      scenario: 'empty',
    })
    expect(await screen.findByText('You’re all caught up')).toBeVisible()
  })

  it('closes on Escape', async () => {
    const onClose = renderOverlay('inbox')
    await screen.findByRole('dialog', { name: 'Notifications' })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('What’s new', () => {
  it('reads as WhatsNew: the app’s eight notes, four new to Ama since 29 Oct', async () => {
    renderOverlay('whats-new')
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(await within(sheet).findAllByRole('article')).toHaveLength(8)
    expect(sheet).toHaveTextContent('4 updates since your last visit on 29 Oct')
    expect(within(sheet).getAllByText('New to you')).toHaveLength(4)
    await userEvent.click(
      within(within(sheet).getByRole('group', { name: 'Show' })).getByRole('button', {
        name: 'Fixed',
      }),
    )
    expect(within(sheet).getAllByRole('article')).toHaveLength(1)
  })

  it('records the visit once it closes, so nothing is new next time', async () => {
    const onClose = vi.fn()
    const { rerender } = renderWithDashboardData(
      <DashboardOverlays org="acme" open="whats-new" onClose={onClose} />,
    )
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    await within(sheet).findAllByRole('article')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(onClose).toHaveBeenCalled()
    // The shell drops ?open=, which closes it.
    rerender(<DashboardOverlays org="acme" open={undefined} onClose={onClose} />)
    await waitFor(() => expect(amaVisit()).not.toBe(SEEDED_VISIT))
  })

  it('records the visit when it closes by navigating away, without Got it', async () => {
    const { rerender } = renderWithDashboardData(
      <DashboardOverlays org="acme" open="whats-new" onClose={vi.fn()} />,
    )
    await within(await screen.findByRole('dialog', { name: 'What’s new' })).findAllByRole('article')
    // A note's link, or Back: ?open= goes without any of the sheet's own buttons.
    rerender(<DashboardOverlays org="acme" open={undefined} onClose={vi.fn()} />)
    await waitFor(() => expect(amaVisit()).not.toBe(SEEDED_VISIT))
  })

  it('doesn’t record a visit when the notes never loaded', async () => {
    const onClose = vi.fn()
    renderWithDashboardData(<DashboardOverlays org="acme" open="whats-new" onClose={onClose} />, {
      scenario: 'error',
    })
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    await within(sheet).findByText(/We couldn’t load/)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(dashboardDb().releaseVisits.find((v) => v.userId === 'usr_ama')!.at).toBe(SEEDED_VISIT)
  })
})

describe('sinceLastVisit', () => {
  const release = (fresh: boolean) => ({ fresh }) as never
  it('counts what’s new since the last visit', () => {
    expect(sinceLastVisit({ releases: [release(true)], lastVisit: '2026-10-20T09:00:00Z' })).toBe(
      '1 update since your last visit on 20 Oct',
    )
    expect(sinceLastVisit({ releases: [release(false)], lastVisit: '2026-10-20T09:00:00Z' })).toBe(
      'Nothing new since your last visit on 20 Oct',
    )
    expect(sinceLastVisit({ releases: [], lastVisit: null })).toBe(
      'What we’ve shipped lately, all new to you',
    )
  })
})

describe('no overlay', () => {
  it('opens nothing for an unknown ?open=', () => {
    renderOverlay('nope')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
