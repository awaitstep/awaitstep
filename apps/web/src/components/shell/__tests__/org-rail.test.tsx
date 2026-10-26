import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookOpen, House } from 'lucide-react'
import { RailAccountButton, RailItem, ThemeButton } from '../rail-item'
import { SampleRail } from './fixtures/frame'

describe('OrgRail', () => {
  it('is an Organization landmark listing the org pages, then the bottom group, in board order', () => {
    render(<SampleRail activeKey="projects" />)
    const rail = screen.getByRole('navigation', { name: 'Organization' })
    const names = within(rail)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(names).toEqual([
      'Projects',
      'Resources',
      'Audit log',
      'Settings',
      "What's new",
      '3Inbox',
      'API',
      'Docs',
    ])
  })

  it('marks only the active item as the current page', () => {
    render(<SampleRail activeKey="audit" />)
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName('Audit log')
  })

  it('folds badges into the accessible name, since the marks are visual only', () => {
    render(<SampleRail />)
    expect(screen.getByRole('link', { name: 'Inbox, 3 unread notifications' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: "What's new, 2 updates since your last visit" }),
    ).toBeInTheDocument()
  })

  it('labels the icon-only org and account buttons', () => {
    render(<SampleRail />)
    expect(
      screen.getByRole('button', { name: 'Acme Inc — switch organization' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your account' })).toBeInTheDocument()
  })
})

describe('RailItem', () => {
  it('caps a large count at 99+', () => {
    render(
      <RailItem
        href="/acme/inbox"
        icon={House}
        label="Inbox"
        badge={{ kind: 'count', value: 140, description: '140 unread notifications' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Inbox, 140 unread notifications' })).toHaveTextContent(
      '99+',
    )
  })
})

describe('RailItem empty and external states', () => {
  it('drops a zero count entirely, from the tile and from the accessible name', () => {
    render(
      <RailItem
        href="/acme/inbox"
        icon={House}
        label="Inbox"
        badge={{ kind: 'count', value: 0, description: '0 unread notifications' }}
      />,
    )
    const link = screen.getByRole('link', { name: 'Inbox' })
    expect(link).toHaveTextContent(/^Inbox$/)
  })

  it('never marks an external item as the current page, even when asked to', () => {
    render(
      <RailItem href="https://docs.awaitstep.dev" icon={BookOpen} label="Docs" external active />,
    )
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).not.toHaveAttribute('aria-current')
    expect(link.querySelector('[data-active-bar]')).toBeNull()
  })
})

describe('RailAccountButton', () => {
  it('shows initials from the name, like every other avatar in the app', () => {
    render(<RailAccountButton user={{ name: 'Ama Mensah', email: 'ama@acme.test' }} />)
    expect(screen.getByRole('button', { name: 'Your account' })).toHaveTextContent('AM')
  })

  it('shows the profile image when there is one', () => {
    render(
      <RailAccountButton user={{ name: 'Ama Mensah', image: 'https://example.test/ama.png' }} />,
    )
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.test/ama.png')
  })
})

describe('ThemeButton', () => {
  it('offers light mode while dark, and dark mode while light', () => {
    const { rerender } = render(<ThemeButton theme="dark" onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveTextContent('Light')
    rerender(<ThemeButton theme="light" onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveTextContent('Dark')
  })

  it('asks to toggle when pressed', async () => {
    const onToggle = vi.fn()
    render(<ThemeButton theme="dark" onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
