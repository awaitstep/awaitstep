import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AppShell } from '../app-shell'
import { PageBody, PageIntro } from '../page-intro'
import { TopBar } from '../top-bar'
import { SampleRail, WorkspacePanel } from './fixtures/frame'

describe('AppShell', () => {
  it('renders rail, panel and the main column', () => {
    render(
      <AppShell rail={<SampleRail />} panel={<WorkspacePanel />}>
        <p>Page</p>
      </AppShell>,
    )
    expect(screen.getByRole('navigation', { name: 'Organization' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Project' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('Page')).toBeInTheDocument()
  })

  it('renders no project panel when none is given, as on org pages', () => {
    render(
      <AppShell rail={<SampleRail activeKey="resources" />}>
        <p>Resources</p>
      </AppShell>,
    )
    expect(screen.getByRole('navigation', { name: 'Organization' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Project' })).not.toBeInTheDocument()
  })
})

describe('TopBar', () => {
  it('marks the last crumb as the current page and never links it', () => {
    render(
      <TopBar
        breadcrumbs={[
          { label: 'Acme Inc', href: '/acme/projects' },
          { label: 'Settings' },
          { label: 'Members', href: '/acme/settings/members' },
        ]}
      />,
    )
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(trail)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Acme Inc'])
    expect(within(trail).getByText('Members')).toHaveAttribute('aria-current', 'page')
    expect(within(trail).getByText('Settings')).not.toHaveAttribute('aria-current')
  })

  it('renders the actions slot', () => {
    render(
      <TopBar
        breadcrumbs={[{ label: 'Acme Inc' }]}
        actions={<button type="button">Invite</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  })
})

describe('PageIntro', () => {
  it('gives the page a single h1 with its description and aside', () => {
    render(
      <PageBody>
        <PageIntro
          title="Projects"
          description="Everything in Acme Inc."
          aside={<span>3 Projects</span>}
        />
      </PageBody>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('Everything in Acme Inc.')).toBeInTheDocument()
    expect(screen.getByText('3 Projects')).toBeInTheDocument()
  })

  it('fills the main column on every page, with no width cap, as the boards draw it', () => {
    render(
      <AppShell rail={<nav>Rail</nav>}>
        <PageBody>
          <p>Body</p>
        </PageBody>
      </AppShell>,
    )
    const column = screen.getByText('Body').parentElement!
    expect(column).toHaveClass('w-full')
    expect(column.className).not.toMatch(/max-w-|mx-auto/)
  })
})
