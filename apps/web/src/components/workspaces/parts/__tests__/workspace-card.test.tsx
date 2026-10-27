import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceCard } from '../workspace-card'
import { IT, SALES, SUPPORT } from './fixtures/workspaces'

describe('WorkspaceCard', () => {
  it('is one link named by the workspace and described by its counts and runs', () => {
    render(<WorkspaceCard workspace={SALES} href="/acme/project-101/sales" current />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    const link = screen.getByRole('link', { name: 'Sales' })
    expect(link).toHaveAttribute('href', '/acme/project-101/sales')
    expect(link).toHaveAccessibleDescription(
      /^4 workflows · 2 functions · 1 shared out.*1 failing · 5m ago$/,
    )
  })

  it('says “You’re here” for the current workspace, over “New”', () => {
    render(<WorkspaceCard workspace={SALES} href="/w" current isNew />)
    expect(screen.getByText('You’re here')).toBeVisible()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('flags a new, empty workspace', () => {
    render(<WorkspaceCard workspace={SUPPORT} href="/w" isNew />)
    expect(screen.getByText('New')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAccessibleDescription(
      /^Nothing built yet.*No runs yet$/,
    )
  })

  it('says who created a workspace that has no description', () => {
    const now = new Date(SUPPORT.createdAt)
    render(<WorkspaceCard workspace={{ ...SUPPORT, description: null }} href="/w" now={now} />)
    expect(screen.getByText(`Created today by ${SUPPORT.createdBy.name}`)).toBeVisible()
  })

  it('counts in the singular and shows passing runs', () => {
    render(<WorkspaceCard workspace={IT} href="/w" />)
    expect(screen.getByRole('link', { name: 'IT' })).toHaveAccessibleDescription(
      /^4 workflows · 1 function · 2 shared out/,
    )
    expect(screen.getByText('All passing · 1h ago')).toBeVisible()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })
})
