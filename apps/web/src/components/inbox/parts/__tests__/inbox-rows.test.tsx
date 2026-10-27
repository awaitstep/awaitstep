import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListCard } from '../../../ui/list-card'
import type { InboxNotification } from '../../../../types/dashboard/inbox'
import { NotificationRow } from '../notification-row'
import { ReleaseNote } from '../release-note'
import {
  APPROVED,
  AUDIT_RELEASE,
  DECLINED,
  FAILURE,
  JOINED,
  REQUEST,
  WORKSPACES_RELEASE,
} from './fixtures/inbox'

function renderRow(notification: InboxNotification, handlers = {}) {
  return render(
    <ListCard label="Notifications">
      <NotificationRow notification={notification} {...handlers} />
    </ListCard>,
  )
}

function DecidableRequest({ onApprove }: { onApprove: (id: string) => void }) {
  const [notification, setNotification] = useState(REQUEST)
  function handleApprove(id: string) {
    setNotification(APPROVED)
    onApprove(id)
  }
  return (
    <ListCard label="Notifications">
      <NotificationRow notification={notification} onApprove={handleApprove} />
    </ListCard>
  )
}

describe('NotificationRow', () => {
  it('marks an unread notification with a named dot', () => {
    renderRow(FAILURE)
    expect(screen.getByRole('img', { name: 'Unread' })).toBeVisible()
    expect(screen.getByText('Project 101 · Sales · 5m ago')).toBeVisible()
  })

  it('has no unread dot once read', () => {
    renderRow(JOINED)
    expect(screen.queryByRole('img', { name: 'Unread' })).not.toBeInTheDocument()
  })

  it('marks the notification read when its link is followed', async () => {
    const onRead = vi.fn()
    renderRow(FAILURE, { onRead })
    const link = screen.getByRole('link', { name: 'See runs' })
    expect(link).toHaveAttribute('href', '/acme/project-101/sales/runs')
    await userEvent.click(link)
    expect(onRead).toHaveBeenCalledWith('fail')
  })

  it('offers Approve and Decline on a pending request', async () => {
    const onApprove = vi.fn()
    const onDecline = vi.fn()
    renderRow(REQUEST, { onApprove, onDecline })
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(onDecline).toHaveBeenCalledWith('req')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith('req')
  })

  it('swaps the buttons for the outcome and moves focus to it', async () => {
    const onApprove = vi.fn()
    render(<DecidableRequest onApprove={onApprove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const outcome = screen.getByRole('status')
    expect(outcome).toHaveTextContent('Approved. Daniel is now an Editor in Sales.')
    expect(outcome).toHaveFocus()
  })

  it('shows a decided request’s outcome without taking focus on first render', () => {
    renderRow(DECLINED)
    const outcome = screen.getByRole('status')
    expect(outcome).toHaveTextContent('Declined. Daniel was told.')
    expect(outcome).not.toHaveFocus()
  })
})

describe('ReleaseNote', () => {
  it('is an article named by its title, with its tag, date and link', () => {
    render(<ReleaseNote release={WORKSPACES_RELEASE} />)
    const article = screen.getByRole('article', { name: 'Workspaces inside projects' })
    expect(
      screen.getByRole('heading', { level: 3, name: 'Workspaces inside projects' }),
    ).toBeVisible()
    expect(article).toHaveTextContent('New')
    expect(article).toHaveTextContent('24 Oct 2026')
    expect(screen.getByText('New to you')).toBeVisible()
    expect(screen.getByRole('link', { name: 'See your workspaces' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/workspaces',
    )
  })

  it('says “New to you” only for fresh entries', () => {
    render(<ReleaseNote release={AUDIT_RELEASE} />)
    expect(screen.getByText('Fixed')).toBeVisible()
    expect(screen.queryByText('New to you')).not.toBeInTheDocument()
  })
})
