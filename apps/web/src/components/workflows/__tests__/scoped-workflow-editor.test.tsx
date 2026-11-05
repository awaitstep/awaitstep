import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEditorScope } from '../../../contexts/editor-scope-context'
import { DataSourceProvider, type DataSource } from '../../../data/dashboard/source'
import { routeScopeKey } from '../../../lib/workflows/route-scope'
import { useOrgStore } from '../../../stores/org-store'
import { ScopedWorkflowEditor } from '../scoped-workflow-editor'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock('../workflow-editor', () => ({
  WorkflowEditor: ({ workflowId }: { workflowId: string }) => {
    const scope = useEditorScope()
    return (
      <p>
        editor {workflowId} in {scope?.workspace}
      </p>
    )
  },
}))
vi.mock('../../canvas/canvas-skeleton', () => ({ CanvasSkeleton: () => <p>canvas loading</p> }))
vi.mock('../../ide/ide-skeleton', () => ({ IdeSkeleton: () => <p>code loading</p> }))
vi.mock('../../ui/shell-link', () => ({
  ShellLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }

function renderAt(source: DataSource, view: 'canvas' | 'ide' = 'canvas') {
  return render(
    <DataSourceProvider source={source}>
      <ScopedWorkflowEditor slugs={SLUGS} workflowId="wf_1" search={{ view }} localDev={false} />
    </DataSourceProvider>,
  )
}

afterEach(() => useOrgStore.getState().clear())

describe('ScopedWorkflowEditor', () => {
  it('waits on the view’s skeleton until API calls follow the URL', () => {
    useOrgStore.setState({ appReady: true, routeScope: null })
    renderAt('api', 'ide')
    expect(screen.getByText('code loading')).toBeVisible()
    expect(screen.queryByText(/^editor/)).toBeNull()
  })

  it('opens the editor in this workspace once they do', () => {
    useOrgStore.setState({
      appReady: true,
      routeScope: { key: routeScopeKey(SLUGS), organizationId: 'org_1', projectId: 'prj_2' },
    })
    renderAt('api')
    expect(screen.getByText('editor wf_1 in sales')).toBeVisible()
  })

  it('doesn’t open while API calls still follow another workspace', () => {
    useOrgStore.setState({
      appReady: true,
      routeScope: { key: 'acme/core/ops', organizationId: 'org_1', projectId: 'prj_2' },
    })
    renderAt('api')
    expect(screen.getByText('canvas loading')).toBeVisible()
  })

  it('says sample items don’t open, on sample data', () => {
    renderAt('mock')
    expect(screen.getByRole('heading', { name: 'This is sample data' })).toBeVisible()
  })
})
