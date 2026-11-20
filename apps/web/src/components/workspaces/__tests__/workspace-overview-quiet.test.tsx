import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceOverview } from '../workspace-overview'
import { olderRun, quietOverview, quietWorkspace } from './fixtures/quiet-overview'

const slugs = { org: 'acme', project: 'project-101', workspace: 'support' }

function renderQuiet(recent = [olderRun]) {
  render(
    <WorkspaceOverview
      slugs={slugs}
      workspace={quietWorkspace}
      overview={quietOverview(recent)}
      people={[]}
      projectName="Project 101"
      quiet
    />,
  )
  return screen.getByRole('table', { name: 'Recent runs' })
}

describe('WorkspaceOverview, quiet (no runs in 24 hours)', () => {
  it('names the 24-hour window instead of claiming nothing ever ran', () => {
    renderQuiet()
    expect(screen.getByText('No runs in the last 24 hours')).toBeVisible()
    expect(screen.queryByText('Nothing has run yet')).toBeNull()
  })

  it('still lists older runs in Recent runs', () => {
    const table = renderQuiet()
    expect(within(table).getByRole('link', { name: 'Ticket triage' })).toBeVisible()
    expect(screen.queryByText('No runs yet')).toBeNull()
  })

  it('does not ask a workspace with a deployed workflow to deploy one', () => {
    renderQuiet()
    expect(
      screen.getByText('Runs show here when a trigger starts a deployed workflow.'),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Deploy one' })).toBeNull()
  })

  it('nudges to deploy when nothing is deployed', () => {
    render(
      <WorkspaceOverview
        slugs={slugs}
        workspace={quietWorkspace}
        overview={quietOverview([], 0)}
        people={[]}
        projectName="Project 101"
        quiet
      />,
    )
    expect(screen.getByRole('link', { name: 'Deploy one' })).toHaveAttribute(
      'href',
      '/acme/project-101/support/workflows',
    )
  })

  it('shows the empty state only when nothing has ever run', () => {
    render(
      <WorkspaceOverview
        slugs={slugs}
        workspace={quietWorkspace}
        overview={quietOverview([])}
        people={[]}
        projectName="Project 101"
        quiet
      />,
    )
    expect(screen.getByText('No runs yet')).toBeVisible()
    expect(screen.queryByText(/Nothing is deployed yet/)).toBeNull()
  })
})
