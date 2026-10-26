import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShellLinkProvider, type ShellLinkProps } from '../../ui/shell-link'
import { TopBar } from '../top-bar'
import { SampleRail, WorkspacePanel } from './fixtures/frame'

function MarkedLink(props: ShellLinkProps) {
  return <a data-router-link="" {...props} />
}

describe('ShellLinkProvider', () => {
  it('renders every in-app rail, panel and breadcrumb link through the provided component', () => {
    render(
      <ShellLinkProvider link={MarkedLink}>
        <SampleRail activeKey="projects" />
        <WorkspacePanel active="workflows" />
        <TopBar
          breadcrumbs={[{ label: 'Acme Inc', href: '/acme/projects' }, { label: 'Members' }]}
        />
      </ShellLinkProvider>,
    )
    const inAppLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('target') !== '_blank')
    expect(inAppLinks.length).toBeGreaterThan(10)
    for (const link of inAppLinks) expect(link).toHaveAttribute('data-router-link')
  })

  it('keeps external links as plain anchors that open a new tab', () => {
    render(
      <ShellLinkProvider link={MarkedLink}>
        <SampleRail />
      </ShellLinkProvider>,
    )
    const docs = screen.getByRole('link', { name: 'Docs' })
    expect(docs).not.toHaveAttribute('data-router-link')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('falls back to plain anchors without a provider', () => {
    render(
      <TopBar
        breadcrumbs={[{ label: 'Acme Inc', href: '/acme/projects' }, { label: 'Members' }]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Acme Inc' })).toHaveAttribute('href', '/acme/projects')
  })
})
