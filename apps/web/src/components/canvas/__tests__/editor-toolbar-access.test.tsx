import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { EditorToolbar, type EditorToolbarProps } from '../editor-toolbar'

vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => vi.fn() }))
vi.mock('../../workflows/workspace-chrome', () => ({
  WorkspaceChrome: ({ title, actions }: { title: ReactNode; actions: ReactNode }) => (
    <header>
      {title}
      {actions}
    </header>
  ),
}))
vi.mock('../../workflows/workflow-title', () => ({
  WorkflowTitle: ({ name }: { name: string }) => <h1>{name}</h1>,
}))

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }

function renderToolbar(props: Partial<EditorToolbarProps>) {
  return render(
    <EditorScopeProvider value={SALES}>
      <EditorToolbar {...BASE} {...props} />
    </EditorScopeProvider>,
  )
}

const BASE: EditorToolbarProps = {
  workflowId: 'wf_1',
  isNew: false,
  workflowName: 'Lead enrichment',
  currentVersion: 3,
  nodeCount: 2,
  isDirty: false,
  hasActiveDeployment: false,
  hasUndeployedChanges: false,
  deployedVersion: undefined,
  showSettings: false,
  onToggleSettings: vi.fn(),
  onSave: vi.fn(),
  isSaving: false,
  onDeploy: vi.fn(),
  onTest: vi.fn(),
}

describe('EditorToolbar for a Viewer', () => {
  it('says the canvas is view only, with nothing to save or deploy', () => {
    renderToolbar({
      readOnly: true,
      viewOnlyReason: 'Building, deploying and sharing need an Editor',
    })
    expect(screen.getByText('View only')).toHaveAttribute(
      'title',
      'Building, deploying and sharing need an Editor',
    )
    for (const name of [/Save/, /Deploy/, /Latest/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('still lets a Viewer export: it only reads', () => {
    const onExport = vi.fn()
    renderToolbar({ readOnly: true, viewOnlyReason: 'Viewers can’t edit', onExport })
    expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument()
  })

  it('still offers Back to latest on an older version', () => {
    renderToolbar({ readOnly: true, readOnlyVersion: 1 })
    expect(screen.getByText('Read-only · v1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Latest/ })).toBeInTheDocument()
  })
})
