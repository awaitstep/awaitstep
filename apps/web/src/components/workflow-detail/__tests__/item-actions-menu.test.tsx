import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { LiveDeployment } from '@awaitstep/ir'
import type { WorkflowSummary } from '../../../lib/api-client'
import type { WorkflowOverview } from '../use-workflow-overview'
import { ItemActionsMenu } from '../item-actions-menu'
import { deleteLine } from '../remove-item-dialogs'
import { EDITOR, VIEWER } from './fixtures/workspace-pages'
import { EditorAccessProvider, type EditorAccess } from '../../../contexts/editor-scope-context'

const calls = vi.hoisted(() => ({
  lock: vi.fn(),
  duplicate: vi.fn(),
  takedown: vi.fn(),
}))
const idle = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null })

vi.mock('../../dashboard/use-workflow-actions', () => ({
  useWorkflowActions: () => ({
    remove: idle(),
    takedown: { ...idle(), mutate: calls.takedown },
    duplicate: { ...idle(), mutate: calls.duplicate },
    exportIr: idle(),
  }),
}))
vi.mock('../use-lock-deployed', () => ({
  useLockDeployed: () => ({ mutate: calls.lock, isPending: false }),
}))
vi.mock('../../../data/dashboard/items', () => ({
  useMoveWorkflows: () => idle(),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
const WORKFLOW: WorkflowSummary = {
  id: 'wf_1',
  name: 'Lead enrichment',
  kind: 'workflow',
  currentVersionId: 'v3',
  createdAt: '',
  updatedAt: '',
}

const live = (id: string, name: string, version: number): LiveDeployment => ({
  id,
  name,
  deploymentId: `d-${id}`,
  callable: false,
  versionId: `v${version}`,
  version,
  versionLocked: false,
  deployedAt: '2026-11-05T09:00:00.000Z',
  deployedByName: null,
})

function overview(
  deployed: boolean,
  locked = false,
  accounts = [live('c-prod', 'Production', 12)],
): WorkflowOverview {
  return {
    hasActiveDeployment: deployed,
    deployBlocked: locked,
    live: deployed ? accounts : [],
    deployedVersion: deployed ? { id: 'v3', version: 12, locked: locked ? 1 : 0 } : undefined,
    versions: [],
    versionsHasMore: false,
  } as unknown as WorkflowOverview
}

function renderMenu(workflow: WorkflowSummary, o: WorkflowOverview, access: EditorAccess = EDITOR) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditorAccessProvider value={access}>
        <ItemActionsMenu slugs={SLUGS} workflow={workflow} overview={o} runCount={128} />
      </EditorAccessProvider>
    </QueryClientProvider>,
  )
  return userEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())

beforeEach(() => vi.clearAllMocks())

describe('ItemActionsMenu (WorkflowActions)', () => {
  it('lists Duplicate · Move · Lock · Export IR, then Take down and Delete (rename is in place)', async () => {
    await renderMenu(WORKFLOW, overview(true))
    expect(items()).toEqual([
      'Duplicate',
      'Move to workspace',
      'Lock',
      'Export IR',
      'Take down',
      'Delete',
    ])
  })

  it('gives an Editor no reason line', async () => {
    await renderMenu(WORKFLOW, overview(true))
    expect(screen.queryByText(VIEWER.reason!)).toBeNull()
  })

  it('lets only workspace admins move it, saying so to other Editors', async () => {
    await renderMenu(WORKFLOW, overview(true), { ...EDITOR, canMove: false })
    const move = screen.getByRole('menuitem', { name: /Move to workspace/ })
    expect(move).toHaveAttribute('aria-disabled', 'true')
    expect(move).toHaveTextContent('Admins only')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).not.toHaveAttribute('aria-disabled')
  })

  it('leaves a Viewer only Export IR, and says why the rest are off', async () => {
    await renderMenu(WORKFLOW, overview(true), VIEWER)
    expect(screen.getByText('Building, deploying and sharing need an Editor')).toBeVisible()
    for (const name of ['Duplicate', 'Move to workspace', 'Lock', 'Take down', 'Delete']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    expect(screen.getByRole('menuitem', { name: 'Export IR' })).not.toHaveAttribute('aria-disabled')
  })

  it('locks the deployed version, and reads Unlock while it is locked', async () => {
    await renderMenu(WORKFLOW, overview(true, true))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unlock' }))
    expect(calls.lock).toHaveBeenCalledWith(false)
  })

  it('has nothing to lock or take down until something is deployed', async () => {
    await renderMenu(WORKFLOW, overview(false))
    expect(screen.getByRole('menuitem', { name: 'Lock' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('menuitem', { name: 'Take down' })).not.toBeInTheDocument()
  })

  it('gives a function the same menu as a workflow (FunctionDetail)', async () => {
    await renderMenu({ ...WORKFLOW, kind: 'script', sharedBy: 'u-ama' }, overview(false))
    expect(items()).toEqual(['Duplicate', 'Move to workspace', 'Lock', 'Export IR', 'Delete'])
  })

  it('takes it down from the one account it is live on, as before', async () => {
    await renderMenu(WORKFLOW, overview(true))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take down' }))
    expect(screen.getByRole('dialog', { name: 'Take down v12?' })).toBeVisible()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(/stops answering on Production/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Take down' }))
    expect(calls.takedown).toHaveBeenCalledWith('c-prod', expect.anything())
  })

  it('asks which account to take it down from when it is live on more than one', async () => {
    await renderMenu(
      WORKFLOW,
      overview(true, false, [live('c-stage', 'Staging', 11), live('c-prod', 'Production', 12)]),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take down' }))
    expect(screen.getByRole('dialog', { name: 'Take down Lead enrichment?' })).toBeVisible()
    expect(screen.getByRole('radio', { name: /Staging/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Production/ }))
    expect(screen.getByText(/stops answering on Production/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Take down' }))
    expect(calls.takedown).toHaveBeenCalledWith('c-prod', expect.anything())
  })

  it('asks before deleting, saying what goes with it', async () => {
    await renderMenu(WORKFLOW, overview(true))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete Lead enrichment?' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete workflow' })).toBeVisible()
  })
})

describe('deleteLine', () => {
  it('counts the versions and runs it knows, and stays vague about the rest', () => {
    expect(deleteLine('workflow', { count: 12, more: false }, 128)).toBe(
      'Its 12 versions and 128 runs go with it. Take it down first if you want the worker gone from Cloudflare.',
    )
    expect(deleteLine('workflow', { count: 25, more: true }, undefined)).toBe(
      'Its versions and runs go with it. Take it down first if you want the worker gone from Cloudflare.',
    )
    expect(deleteLine('script', { count: 1, more: false }, 9)).toBe(
      'Its 1 version goes with it. Take it down first if you want the worker gone from Cloudflare.',
    )
  })
})
