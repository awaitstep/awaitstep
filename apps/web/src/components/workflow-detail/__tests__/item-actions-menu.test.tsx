import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../../lib/api-client'
import type { WorkflowOverview } from '../use-workflow-overview'
import { ItemActionsMenu } from '../item-actions-menu'
import { deleteLine } from '../remove-item-dialogs'

const calls = vi.hoisted(() => ({
  lock: vi.fn(),
  share: vi.fn(),
  duplicate: vi.fn(),
}))
const idle = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null })

vi.mock('../../dashboard/use-workflow-actions', () => ({
  useWorkflowActions: () => ({
    remove: idle(),
    takedown: idle(),
    duplicate: { ...idle(), mutate: calls.duplicate },
    exportIr: idle(),
  }),
}))
vi.mock('../use-lock-deployed', () => ({
  useLockDeployed: () => ({ mutate: calls.lock, isPending: false }),
}))
vi.mock('../../../data/dashboard/items', () => ({
  useSetShared: () => ({ mutate: calls.share, isPending: false }),
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

function overview(deployed: boolean, locked = false): WorkflowOverview {
  return {
    hasActiveDeployment: deployed,
    deployBlocked: locked,
    activeDeployment: deployed ? { versionId: 'v3' } : undefined,
    deployedVersion: deployed ? { version: 12 } : undefined,
    versions: [],
    versionsHasMore: false,
  } as unknown as WorkflowOverview
}

function renderMenu(workflow: WorkflowSummary, o: WorkflowOverview) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ItemActionsMenu slugs={SLUGS} workflow={workflow} overview={o} runCount={128} />
    </QueryClientProvider>,
  )
  return userEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())

beforeEach(() => vi.clearAllMocks())

describe('ItemActionsMenu (WorkflowActions)', () => {
  it('lists Rename · Duplicate · Move · Lock · Export IR, then Take down and Delete', async () => {
    await renderMenu(WORKFLOW, overview(true))
    expect(items()).toEqual([
      'Rename',
      'Duplicate',
      'Move to workspace',
      'Lock',
      'Export IR',
      'Take down',
      'Delete',
    ])
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

  it('offers Stop sharing in place of Move on a shared function (FunctionDetail)', async () => {
    await renderMenu({ ...WORKFLOW, kind: 'script', sharedBy: 'u-ama' }, overview(false))
    expect(screen.queryByRole('menuitem', { name: 'Move to workspace' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Stop sharing' }))
    expect(calls.share).toHaveBeenCalledWith({ itemId: 'wf_1', shared: false }, expect.anything())
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
