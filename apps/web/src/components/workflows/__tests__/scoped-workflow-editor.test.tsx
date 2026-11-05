import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataSourceProvider, type DataSource } from '../../../data/dashboard/source'
import { ApiClientProvider } from '../../../contexts/api-client-context'
import type { ItemApiScope } from '../../../lib/workflows/route-scope'
import { useOrgStore } from '../../../stores/org-store'
import { ScopedWorkflowEditor } from '../scoped-workflow-editor'

const loaded = vi.hoisted(() => ({
  workflow: undefined as { workspaceId: string } | undefined,
  fetching: false,
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  useLocation: () => ({ pathname: '/acme/core/sales/workflows/wf_1' }),
}))
vi.mock('../../workflow-detail/use-scoped-workflow', () => ({
  useScopedWorkflow: () => ({ data: loaded.workflow, isFetching: loaded.fetching }),
}))
vi.mock('../workflow-editor', () => ({
  WorkflowEditor: ({ workflowId }: { workflowId: string }) => <p>editor {workflowId}</p>,
}))
vi.mock('../../canvas/canvas-skeleton', () => ({ CanvasSkeleton: () => <p>canvas loading</p> }))
vi.mock('../../ide/ide-skeleton', () => ({ IdeSkeleton: () => <p>code loading</p> }))
vi.mock('../../ui/shell-link', () => ({
  ShellLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }

const SALES_IDS: ItemApiScope = {
  organizationId: 'org_1',
  projectId: 'prj_2',
  workspaceId: 'ws_sales',
}

function renderAt(
  source: DataSource,
  view: 'canvas' | 'ide' = 'canvas',
  scope: ItemApiScope | null = SALES_IDS,
) {
  return render(
    <DataSourceProvider source={source}>
      <ApiClientProvider scope={scope}>
        <ScopedWorkflowEditor slugs={SLUGS} workflowId="wf_1" search={{ view }} localDev={false} />
      </ApiClientProvider>
    </DataSourceProvider>,
  )
}

beforeEach(() => {
  useOrgStore.setState({ appReady: true })
})

afterEach(() => {
  useOrgStore.getState().clear()
  loaded.workflow = undefined
  loaded.fetching = false
})

describe('ScopedWorkflowEditor', () => {
  it('waits on the view’s skeleton while the URL names no project to call', () => {
    renderAt('api', 'ide', null)
    expect(screen.getByText('code loading')).toBeVisible()
    expect(screen.queryByText(/^editor/)).toBeNull()
  })

  it('opens the editor in this workspace once they do', () => {
    renderAt('api')
    expect(screen.getByText('editor wf_1')).toBeVisible()
  })

  it('won’t open a workflow from another workspace under this one’s URL', () => {
    loaded.workflow = { workspaceId: 'ws_ops' }
    renderAt('api')
    expect(screen.queryByText('editor wf_1')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute(
      'href',
      '/acme/core/sales/overview',
    )
  })

  it('waits on a cached read from another workspace while a fresh one comes (after a move)', () => {
    loaded.workflow = { workspaceId: 'ws_ops' }
    loaded.fetching = true
    renderAt('api')
    expect(screen.getByText('canvas loading')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Back to the workspace' })).not.toBeInTheDocument()
  })

  it('opens it while the workflow is still loading, or when it is this workspace’s', () => {
    loaded.workflow = { workspaceId: 'ws_sales' }
    renderAt('api')
    expect(screen.getByText('editor wf_1')).toBeVisible()
  })

  it('says sample items don’t open, on sample data', () => {
    renderAt('mock')
    expect(screen.getByRole('heading', { name: 'This is sample data' })).toBeVisible()
  })
})
