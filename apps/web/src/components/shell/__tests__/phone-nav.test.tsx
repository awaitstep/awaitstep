import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from '../app-shell'
import { MobileTabBar } from '../mobile-nav'
import { ProjectMenu, ProjectMenuSwitchButton } from '../project-menu'
import { SampleRail, workspaceItems } from './fixtures/frame'
import {
  OrgMobileHeader,
  SampleTabBar,
  WorkspaceMobileHeader,
  menuWorkspaces,
  mobileTabs,
} from './fixtures/phone'

describe('MobileTabBar', () => {
  it('is the organization navigation with five tabs and the current one marked', () => {
    render(<SampleTabBar activeKey="audit" />)
    const nav = screen.getByRole('navigation', { name: 'Organization' })
    // styles.css lifts toasts clear of the tab bar by this marker.
    expect(nav).toHaveAttribute('data-mobile-tab-bar')
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Projects',
      'Resources',
      'Audit log',
      '3Inbox',
      'Settings',
    ])
    expect(within(nav).getByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')
  })

  it('puts the unread count in the Inbox name and drops it at zero', () => {
    const { rerender } = render(<MobileTabBar items={mobileTabs} />)
    expect(screen.getByRole('link', { name: 'Inbox, 3 unread notifications' })).toBeInTheDocument()
    rerender(
      <MobileTabBar
        items={mobileTabs.map((entry) =>
          entry.key === 'inbox'
            ? { ...entry, badge: { kind: 'count', value: 0, description: 'none unread' } }
            : entry,
        )}
      />,
    )
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
  })
})

describe('MobileHeader', () => {
  it('labels the org switcher and account on org pages', () => {
    render(<OrgMobileHeader />)
    expect(screen.getByRole('button', { name: 'Acme Inc, switch organization' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Your account' })).toBeVisible()
  })

  it('labels the back link and the scope button on workspace pages', () => {
    render(<WorkspaceMobileHeader />)
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
    expect(
      screen.getByRole('button', { name: 'Project 101, Sales. Open the project menu' }),
    ).toBeVisible()
  })
})

describe('Project menu', () => {
  it('opens as a dialog from the scope button, and Escape returns focus to it', async () => {
    const user = userEvent.setup()
    render(<WorkspaceMobileHeader />)
    const trigger = screen.getByRole('button', {
      name: 'Project 101, Sales. Open the project menu',
    })

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Project menu' })
    expect(dialog).toHaveClass('bottom-0', 'inset-x-0', 'rounded-t-2xl')
    expect(dialog.className).not.toMatch(/max-w-/)
    expect(within(dialog).getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('links every workspace, page, switch and settings entry, marking the current ones', () => {
    render(<WorkspaceMobileHeader initiallyOpen />)
    const dialog = screen.getByRole('dialog', { name: 'Project menu' })
    for (const workspace of menuWorkspaces) {
      expect(
        within(dialog).getByRole('link', { name: new RegExp(`^${workspace.name}`) }),
      ).toHaveAttribute('href', workspace.href)
    }
    expect(within(dialog).getByRole('link', { name: /^Sales/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(within(dialog).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(dialog).getByRole('link', { name: 'Project Project 101, switch project' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Project' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'New' })).toBeInTheDocument()
  })

  function renderMenu(newWorkspaceHref?: string) {
    const onClose = vi.fn()
    // Hash links, so following one in jsdom doesn't try to navigate.
    render(
      <ProjectMenu
        project={{ name: 'Project 101', tile: { initial: 'P' }, switchHref: '#projects' }}
        workspaces={menuWorkspaces.map((w) => ({ ...w, href: `#${w.key}` }))}
        newWorkspaceHref={newWorkspaceHref}
        nav={workspaceItems.map((item) => ({ ...item, href: `#${item.key}` }))}
        projectHref="#settings"
        onClose={onClose}
      />,
    )
    return onClose
  }

  it('closes when any of its links is followed', async () => {
    const user = userEvent.setup()
    const onClose = renderMenu('#new')
    const links = screen.getAllByRole('link')
    for (const link of links) await user.click(link)
    expect(onClose).toHaveBeenCalledTimes(links.length)
  })

  it('hides New when the viewer may not create workspaces', () => {
    renderMenu()
    expect(screen.queryByRole('link', { name: 'New' })).not.toBeInTheDocument()
  })

  it('draws each workspace tile from its tile prop, not the name', () => {
    render(
      <ProjectMenu
        project={{ name: 'Project 101', tile: { initial: 'P' }, switchHref: '#projects' }}
        workspaces={[
          {
            key: 'ops',
            name: ' ops',
            tile: { initial: 'O', colour: 'rose' },
            count: '',
            href: '#ops',
          },
        ]}
        nav={[]}
        projectHref="#settings"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /ops/ })).toHaveTextContent(/^O/)
  })

  it('puts a switch control in place of the Switch link when given one', async () => {
    const onClick = vi.fn()
    const project = { name: 'Project 101', tile: { initial: 'P' } }
    render(
      <ProjectMenu
        project={{ ...project, switchHref: '#projects' }}
        switchControl={<ProjectMenuSwitchButton project={project} onClick={onClick} />}
        workspaces={[]}
        nav={[]}
        projectHref="#settings"
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: /switch project/ })).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Project Project 101, switch project' }),
    )
    expect(onClick).toHaveBeenCalled()
  })

  it('closes from its Close button', async () => {
    const user = userEvent.setup()
    render(<WorkspaceMobileHeader initiallyOpen />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AppShell on phones', () => {
  it('renders the header and tab bar behind md:hidden and pads main for the tab bar', () => {
    render(
      <AppShell rail={<SampleRail />} mobileHeader={<OrgMobileHeader />} tabBar={<SampleTabBar />}>
        <p>Page</p>
      </AppShell>,
    )
    expect(screen.getByRole('banner').parentElement).toHaveClass('md:hidden')
    const navs = screen.getAllByRole('navigation', { name: 'Organization' })
    expect(navs).toHaveLength(2)
    expect(navs[1].parentElement).toHaveClass('md:hidden')
    expect(screen.getByRole('main').className).toContain(
      'pb-[calc(3.5rem+env(safe-area-inset-bottom))]',
    )
  })

  it('adds no padding when there is no tab bar', () => {
    render(
      <AppShell rail={<SampleRail />}>
        <p>Page</p>
      </AppShell>,
    )
    expect(screen.getByRole('main').className).not.toContain('pb-[')
  })
})
