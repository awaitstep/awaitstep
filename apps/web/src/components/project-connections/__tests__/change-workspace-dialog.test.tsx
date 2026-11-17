import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChangeWorkspaceDialog } from '../change-workspace-dialog'
import type { ProjectWorkspaceConnection } from '../../../types/dashboard/project-connections'

const SALES: ProjectWorkspaceConnection = {
  workspaceId: 'ws-sales',
  name: 'Sales',
  connectionId: null,
  connectionName: null,
  source: 'default',
  lastDeployAt: null,
}

function renderDialog(props: { onConnectNew?: () => void; connectPending?: boolean } = {}) {
  render(
    <ChangeWorkspaceDialog
      workspace={SALES}
      connections={[]}
      pending={false}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

describe('ChangeWorkspaceDialog', () => {
  it('starts connecting a new account for the workspace from a button, not a link', async () => {
    const onConnectNew = vi.fn()
    renderDialog({ onConnectNew })
    expect(screen.queryByRole('link', { name: 'Connect a new account' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Connect a new account' }))
    expect(onConnectNew).toHaveBeenCalledOnce()
  })

  it('holds the button while the start is out', () => {
    renderDialog({ onConnectNew: vi.fn(), connectPending: true })
    expect(screen.getByRole('button', { name: 'Connect a new account' })).toBeDisabled()
  })

  it('offers no new account where sign-in with Cloudflare isn’t set up', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: 'Connect a new account' })).toBeNull()
  })
})
