import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelScopeButton } from '../context-panel'
import {
  NoProjectPanel,
  OrgSettingsPanel,
  ProjectSettingsPanel,
  WorkspacePanel,
} from './fixtures/frame'

describe('ContextPanel modes', () => {
  it('workspace mode: project and workspace switchers, the workspace items, Project settings pinned last', () => {
    render(<WorkspacePanel active="workflows" />)
    const panel = screen.getByRole('navigation', { name: 'Project' })
    expect(
      within(panel).getByRole('button', { name: 'Project: Project 101. Switch project' }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'Workspace: Sales. Switch workspace' }),
    ).toBeInTheDocument()
    expect(
      within(panel)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Overview',
      'Workflows',
      'Functions',
      'Library',
      'Runs',
      'Workspace settings',
      'Project settings',
    ])
    expect(within(panel).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('project-settings mode: back to the workspace, then the settings sections as a captioned group', () => {
    render(<ProjectSettingsPanel active="general" />)
    const panel = screen.getByRole('navigation', { name: 'Project settings' })
    expect(within(panel).getByRole('link', { name: 'Back to workspace' })).toBeInTheDocument()
    const group = within(panel).getByRole('group', { name: 'Project settings' })
    expect(
      within(group)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Workspaces', 'Shared library', 'Members', 'API keys', 'Variables', 'General'])
  })

  it('org-settings mode: the org as a plain header, not a switcher', () => {
    render(<OrgSettingsPanel active="members" />)
    const panel = screen.getByRole('navigation', { name: 'Organization settings' })
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()
    expect(within(panel).getByText('Acme Inc')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Back to Project 101' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('no-project state: says why the menu is empty and offers to create a project', () => {
    render(<NoProjectPanel />)
    expect(screen.getByText('No project yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a project' })).toBeInTheDocument()
  })
})

describe('PanelScopeButton', () => {
  it('passes extra props and the ref to its button, so a popover can use it as the trigger', async () => {
    const onClick = vi.fn()
    const ref = { current: null as HTMLButtonElement | null }
    render(
      <PanelScopeButton
        ref={ref}
        variant="card"
        scope="Workspace"
        name="Sales"
        tile={{ initial: 'S', colour: 'green' }}
        aria-expanded="false"
        onClick={onClick}
      />,
    )
    const button = screen.getByRole('button', { name: 'Workspace: Sales. Switch workspace' })
    expect(ref.current).toBe(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
