import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectCard } from '../project-card'
import { MARKETING_SITE, NEW_PROJECT, PROJECT_101 } from './fixtures/projects'

describe('ProjectCard', () => {
  it('is one link named by the project and described by its workspaces, people and runs', () => {
    render(<ProjectCard project={PROJECT_101} href="/acme/project-101/sales" current />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    const link = screen.getByRole('link', { name: 'Project 101' })
    expect(link).toHaveAttribute('href', '/acme/project-101/sales')
    expect(link).toHaveAccessibleDescription(/Sales.*IT.*Support.*8 workflows/)
    expect(link).toHaveAccessibleDescription(/1 failing · 5 minutes ago/)
  })

  it('marks the current project', () => {
    render(<ProjectCard project={PROJECT_101} href="/p" current />)
    expect(screen.getByText('Current')).toBeVisible()
  })

  it('shows every workspace as a chip and the people as one image', () => {
    render(<ProjectCard project={PROJECT_101} href="/p" />)
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
    expect(screen.getByText('Support')).toBeVisible()
    expect(
      screen.getByRole('img', { name: 'Ama Mensah, Daniel Kim, Lena Ortiz and 3 others' }),
    ).toBeVisible()
  })

  it('says when every run is passing, and when there are no runs yet', () => {
    const { unmount } = render(<ProjectCard project={MARKETING_SITE} href="/p" />)
    expect(screen.getByText('All passing · 3 hours ago')).toBeVisible()
    unmount()
    render(<ProjectCard project={NEW_PROJECT} href="/p" />)
    expect(screen.getByText('No runs yet')).toBeVisible()
    expect(screen.getByText('0 workflows')).toBeVisible()
  })
})
