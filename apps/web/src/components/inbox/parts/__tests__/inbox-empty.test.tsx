import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InboxEmpty } from '../inbox-empty'
import { NoMatchingNotes, NoReleaseNotes, UpToDateNote } from '../whats-new-states'

describe('InboxEmpty', () => {
  it('says nothing has arrived yet, and links to what you are notified about', () => {
    render(
      <InboxEmpty kind="none" total={0} settingsHref="/acme/account/profile" onShowAll={vi.fn()} />,
    )
    expect(screen.getByText('Nothing yet')).toBeVisible()
    expect(
      screen.getByText(/Failures, access requests and expiring keys appear here/),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /Choose what you’re notified about/ })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([
    ['read', 'You’re all caught up', 'Nothing unread. Notifications clear after 30 days.'],
    ['done', 'Nothing needs you', 'Access requests and expiring keys appear here'],
  ] as const)('says %s, and shows everything on request', async (kind, title, body) => {
    const onShowAll = vi.fn()
    render(<InboxEmpty kind={kind} total={6} settingsHref="/x" onShowAll={onShowAll} />)
    expect(screen.getByText(title)).toBeVisible()
    expect(screen.getByText(new RegExp(body))).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 6' }))
    expect(onShowAll).toHaveBeenCalled()
  })
})

describe('InboxEmpty, older', () => {
  it('says the matches are older and shows every notification on request', async () => {
    const onShowAll = vi.fn()
    render(<InboxEmpty kind="older" total={140} settingsHref="/x" onShowAll={onShowAll} />)
    expect(screen.getByText('None in your latest notifications')).toBeVisible()
    expect(screen.queryByText(/all caught up/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 140' }))
    expect(onShowAll).toHaveBeenCalled()
  })
})

describe('What’s new states', () => {
  it('says what has been seen', () => {
    render(<UpToDateNote />)
    expect(screen.getByText('You’ve seen everything')).toBeVisible()
    expect(screen.getByText('Nothing new since your last visit.')).toBeVisible()
  })

  it('explains an empty What’s new in two short lines', () => {
    render(<NoReleaseNotes />)
    expect(screen.getByText('Nothing to show yet')).toBeVisible()
    expect(
      screen.getByText('Release notes will show up here, with a link to what changed.'),
    ).toBeVisible()
    expect(screen.getByText('Older releases are in the full changelog below.')).toBeVisible()
  })

  it.each([
    ['new', 'No new features in these notes'],
    ['improved', 'No improvements in these notes'],
    ['fixed', 'No fixes in these notes'],
  ] as const)(
    'names the %s tag with nothing under it, with no age limit promised',
    async (tag, title) => {
      const onShowAll = vi.fn()
      const { container } = render(<NoMatchingNotes tag={tag} onShowAll={onShowAll} />)
      expect(screen.getByText(title)).toBeVisible()
      expect(container).not.toHaveTextContent(/90 days/)
      await userEvent.click(screen.getByRole('button', { name: 'Show everything' }))
      expect(onShowAll).toHaveBeenCalled()
    },
  )
})
