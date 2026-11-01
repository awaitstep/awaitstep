import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccessDraft } from '../../../../types/dashboard/access'
import { AccessTree } from '../access-tree'
import { ACCESS_PROJECTS, DANIEL_ACCESS } from './fixtures/projects'

function Controlled({
  initial,
  onChange,
}: {
  initial: AccessDraft
  onChange?: (next: AccessDraft) => void
}) {
  const [value, setValue] = useState(initial)
  function handleChange(next: AccessDraft) {
    setValue(next)
    onChange?.(next)
  }
  return (
    <AccessTree
      personFirstName="Daniel"
      orgName="Acme Inc"
      projects={ACCESS_PROJECTS}
      value={value}
      onChange={handleChange}
    />
  )
}

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

function places(): string[] {
  const list = screen.getByRole('list', { name: 'Daniel can work in' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

describe('AccessTree', () => {
  it('labels the org role, every project and every workspace select', () => {
    render(<Controlled initial={DANIEL_ACCESS} />)
    expect(screen.getByRole('combobox', { name: 'Role in Acme Inc' })).toHaveAccessibleDescription(
      'Sees only the projects and workspaces given below',
    )
    expect(screen.getByRole('combobox', { name: 'Project 101' })).toHaveTextContent(
      'No project role',
    )
    expect(screen.getByRole('combobox', { name: 'Sales' })).toHaveTextContent('Editor')
    expect(screen.getAllByRole('combobox')).toHaveLength(1 + 3 + 5)
    expect(places()).toEqual(['Project 101 · Sales (Editor)'])
  })

  it('turns a project’s workspace selects into “Covered by” once it has a role', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={DANIEL_ACCESS} onChange={onChange} />)
    await pick(screen.getByRole('combobox', { name: 'Project 101' }), 'Project member')
    expect(onChange).toHaveBeenLastCalledWith({
      ...DANIEL_ACCESS,
      projects: { p101: 'member' },
    })
    expect(screen.queryByRole('combobox', { name: 'Sales' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Covered by Project member')).toHaveLength(3)
    expect(places()).toEqual(['Project 101 · all workspaces (Project member)'])
  })

  it('restores the workspace roles when the project role is removed again', async () => {
    render(<Controlled initial={{ ...DANIEL_ACCESS, projects: { p101: 'member' } }} />)
    await pick(screen.getByRole('combobox', { name: 'Project 101' }), 'No project role')
    expect(screen.getByRole('combobox', { name: 'Sales' })).toHaveTextContent('Editor')
  })

  it('reports a workspace role change', async () => {
    const onChange = vi.fn()
    render(<Controlled initial={DANIEL_ACCESS} onChange={onChange} />)
    await pick(screen.getByRole('combobox', { name: 'IT' }), 'Viewer')
    expect(onChange).toHaveBeenLastCalledWith({
      ...DANIEL_ACCESS,
      workspaces: { sales: 'editor', it: 'viewer' },
    })
  })

  it('hides the projects for an org admin and says why', async () => {
    render(<Controlled initial={DANIEL_ACCESS} />)
    await pick(screen.getByRole('combobox', { name: 'Role in Acme Inc' }), 'Admin')
    expect(
      screen.queryByRole('heading', { name: 'Projects and workspaces' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /Admins open every project and workspace, so per-project roles aren’t needed/,
      ),
    ).toBeVisible()
    expect(places()).toEqual(['Every project and workspace in Acme Inc'])
  })

  it('names owners in the note for an org owner', () => {
    render(<Controlled initial={{ ...DANIEL_ACCESS, orgRole: 'owner' }} />)
    expect(screen.getByText(/^Owners open every project/)).toBeVisible()
  })
})
