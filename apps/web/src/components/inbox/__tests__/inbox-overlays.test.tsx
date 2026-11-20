import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  installFakeApi,
  renderWithDashboardApi,
  reply,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { DashboardOverlays } from '../dashboard-overlays'
import { sinceLastVisit } from '../whats-new-sheet'

/** Read marks and request answers, applied to the seed as the API would. */
function scriptInbox(api: FakeApi) {
  const seed = api.data.seed
  const markRead = (id: string) =>
    seed.notificationReads.push({ userId: api.viewer, notificationId: id })
  api.on('POST /notifications/:id/read', (req) => {
    markRead(req.params.id!)
    return { ok: true }
  })
  api.on('POST /notifications/read-all', () => {
    for (const n of seed.notifications) markRead(n.id)
    for (const r of seed.editRequests) markRead(r.id)
    return { updated: seed.notifications.length }
  })
  for (const decision of ['approve', 'decline'] as const) {
    api.on(`POST /access-requests/:id/${decision}`, (req) => {
      seed.editRequests.find((r) => r.id === req.params.id)!.status =
        decision === 'approve' ? 'approved' : 'declined'
      return { ok: true, alreadyEditing: false }
    })
  }
}
const inbox = () => screen.getByRole('dialog', { name: 'Notifications' })
const rows = () => within(inbox()).getAllByRole('listitem')
const show = (name: RegExp) =>
  within(within(inbox()).getByRole('group', { name: 'Show' })).getByRole('button', { name })

function renderOverlay(open: string, onClose = vi.fn(), api: FakeApi = installFakeApi()) {
  scriptInbox(api)
  renderWithDashboardApi(<DashboardOverlays org="acme" open={open} onClose={onClose} />, { api })
  return onClose
}

describe('Inbox', () => {
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
    expect(within(inbox()).queryByRole('button', { name: 'Mark all as read' })).toBeNull()
  })

  it('says you’re all caught up under Unread once everything is read, and shows all again', async () => {
    renderOverlay('inbox')
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(within(inbox()).getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(show(/Unread/)).toHaveTextContent('0'))
    await userEvent.click(show(/Unread/))
    expect(within(inbox()).getByText('You’re all caught up')).toBeVisible()
    await userEvent.click(within(inbox()).getByRole('button', { name: 'Show all 6' }))
    expect(rows()).toHaveLength(6)
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

  it('says nothing needs you under Needs action when only read, no-action notes are left', async () => {
    const api = installFakeApi()
    // One note, already read, that needs nothing.
    api.data.seed.notifications = api.data.seed.notifications
      .filter((n) => !n.needsAction)
      .slice(0, 1)
    api.data.seed.editRequests = []
    api.data.seed.notificationReads.push({
      userId: api.viewer,
      notificationId: api.data.seed.notifications[0]!.id,
    })
    renderOverlay('inbox', vi.fn(), api)
    await within(await screen.findByRole('dialog', { name: 'Notifications' })).findAllByRole(
      'listitem',
    )
    await userEvent.click(show(/Needs action/))
    expect(within(inbox()).getByText('Nothing needs you')).toBeVisible()
    await userEvent.click(within(inbox()).getByRole('button', { name: 'Show all 1' }))
    expect(rows()).toHaveLength(1)
  })

  it('closes on Escape', async () => {
    const onClose = renderOverlay('inbox')
    await screen.findByRole('dialog', { name: 'Notifications' })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('What’s new', () => {
  it('records the visit once it closes, so nothing is new next time', async () => {
    const onClose = vi.fn()
    const api = installFakeApi()
    const { rerender } = renderWithDashboardApi(
      <DashboardOverlays org="acme" open="whats-new" onClose={onClose} />,
      { api },
    )
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    await within(sheet).findAllByRole('article')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(onClose).toHaveBeenCalled()
    // The shell drops ?open=, which closes it.
    rerender(<DashboardOverlays org="acme" open={undefined} onClose={onClose} />)
    await waitFor(() => expect(api.requestsTo('PUT /releases/visit')).toHaveLength(1))
  })

  it('records the visit when it closes by navigating away, without Got it', async () => {
    const api = installFakeApi()
    const { rerender } = renderWithDashboardApi(
      <DashboardOverlays org="acme" open="whats-new" onClose={vi.fn()} />,
      { api },
    )
    await within(await screen.findByRole('dialog', { name: 'What’s new' })).findAllByRole('article')
    // A note's link, or Back: ?open= goes without any of the sheet's own buttons.
    rerender(<DashboardOverlays org="acme" open={undefined} onClose={vi.fn()} />)
    await waitFor(() => expect(api.requestsTo('PUT /releases/visit')).toHaveLength(1))
  })

  it('doesn’t record a visit when the notes never loaded', async () => {
    const onClose = vi.fn()
    const api = installFakeApi()
    api.on('GET /releases/visit', reply(503, { error: 'Unavailable' }))
    renderWithDashboardApi(<DashboardOverlays org="acme" open="whats-new" onClose={onClose} />, {
      api,
    })
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    await within(sheet).findByText(/We couldn’t load/)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))
    expect(api.requestsTo('PUT /releases/visit')).toHaveLength(0)
  })
})

describe('sinceLastVisit', () => {
  const release = (fresh: boolean) => ({ fresh }) as never
  it('counts what’s new since the last visit', () => {
    expect(sinceLastVisit({ releases: [release(true)], lastVisit: '2026-10-20T09:00:00Z' })).toBe(
      '1 update since your last visit on 20 Oct',
    )
    expect(sinceLastVisit({ releases: [release(false)], lastVisit: '2026-10-20T09:00:00Z' })).toBe(
      'Up to date',
    )
    expect(sinceLastVisit({ releases: [release(true)], lastVisit: null })).toBe(
      'What we’ve shipped lately, all new to you',
    )
    expect(sinceLastVisit({ releases: [], lastVisit: null })).toBe('Release notes show up here')
  })
})

describe('no overlay', () => {
  it('opens nothing for an unknown ?open=', () => {
    renderOverlay('nope')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
