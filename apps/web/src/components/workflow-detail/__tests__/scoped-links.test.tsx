import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorScopeProvider, useEditorScope } from '../../../contexts/editor-scope-context'
import type { RunSummary } from '../../../lib/api-client'
import { RecentRuns } from '../../overview/recent-runs'
import { ItemScopeLayout } from '../item-scope-layout'

const navigated = vi.hoisted(() => [] as unknown[])

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => {
    const scope = useEditorScope()
    return <p>inside {scope ? `${scope.org}/${scope.project}/${scope.workspace}` : 'nothing'}</p>
  },
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Navigate: (props: unknown) => {
    navigated.push(props)
    return null
  },
  useNavigate: () => vi.fn(),
}))
vi.mock('../../monitoring/run-detail-sheet', () => ({ RunDetailSheet: () => <p>sheet</p> }))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
const RUN = {
  id: 'run_1',
  workflowId: 'wf_1',
  instanceId: 'inst_abc',
  status: 'complete',
  createdAt: new Date().toISOString(),
} as RunSummary

describe('ItemScopeLayout', () => {
  it('tells everything under a workflow’s URL which workspace it is in', () => {
    render(<ItemScopeLayout org="acme" project="core" workspace="sales" scope={null} />)
    expect(screen.getByText('inside acme/core/sales')).toBeVisible()
  })
})

describe('RecentRuns', () => {
  it('opens a run as its own page in a workspace', () => {
    render(
      <EditorScopeProvider value={SLUGS}>
        <RecentRuns workflowId="wf_1" runs={[RUN]} />
      </EditorScopeProvider>,
    )
    expect(screen.getByRole('link', { name: /inst_abc/ })).toHaveAttribute(
      'href',
      '/acme/core/sales/workflows/wf_1/runs/run_1',
    )
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/acme/core/sales/workflows/wf_1/runs',
    )
    expect(screen.queryByText('sheet')).not.toBeInTheDocument()
  })

  it('keeps the sheet on the old pages', () => {
    render(<RecentRuns workflowId="wf_1" runs={[RUN]} />)
    expect(screen.getByRole('button', { name: /inst_abc/ })).toBeVisible()
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/workflows/wf_1/runs',
    )
    expect(screen.getByText('sheet')).toBeInTheDocument()
  })
})

describe('FunctionHasNoRuns', () => {
  it('lands a function’s Runs URL on its Overview, replacing it in history', async () => {
    const { FunctionHasNoRuns } = await import('../function-has-no-runs')
    render(
      <EditorScopeProvider value={SLUGS}>
        <FunctionHasNoRuns workflowId="fn_1" />
      </EditorScopeProvider>,
    )
    expect(navigated).toEqual([{ to: '/acme/core/sales/workflows/fn_1/overview', replace: true }])
  })
})
