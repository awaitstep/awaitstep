import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../../lib/api-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const deleteProject = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  api: { deleteProject },
}))

import { ApiError } from '../../../lib/api-client'
import type { Project } from '../../../stores/org-store'
import { ProjectsList } from '../projects-list'

function project(id: string, name: string): Project {
  return { id, organizationId: 'o', name, slug: id, createdAt: '', updatedAt: '' }
}

function trashButtons(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((button) => button.querySelector('.lucide-trash-2') !== null)
}

describe('ProjectsList delete', () => {
  it('opens the next project’s confirm without the last one’s failure', async () => {
    deleteProject.mockRejectedValueOnce(new ApiError('Project has deployed workflows', 409))
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <ProjectsList projects={[project('a', 'Alpha'), project('b', 'Beta')]} loading={false} />
      </QueryClientProvider>,
    )

    await userEvent.click(trashButtons()[0]!)
    let dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Project has deployed workflows',
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(trashButtons()[1]!)
    dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/"Beta"/)).toBeVisible()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never shows a server failure’s own text', async () => {
    deleteProject.mockRejectedValueOnce(new ApiError('relation "projects" is locked', 500))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectsList projects={[project('a', 'Alpha')]} loading={false} />
      </QueryClientProvider>,
    )
    await userEvent.click(trashButtons()[0]!)
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t delete the project',
    )
    expect(dialog).not.toHaveTextContent('relation')
  })
})
