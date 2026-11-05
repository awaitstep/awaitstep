import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  EditorScopeProvider,
  useEditorAccess,
  useEditorScope,
} from '../../../contexts/editor-scope-context'
import { VIEW_ONLY_MESSAGE } from '../../../lib/ide/editability'
import { ItemScopeLayout } from '../item-scope-layout'

const navigated = vi.hoisted(() => [] as unknown[])
const ADMIN_CAN = {
  edit: { allowed: true },
  deploy: { allowed: true },
  share: { allowed: true },
  manageSettings: { allowed: true },
}
const viewer = vi.hoisted(() => ({
  can: {} as Record<string, { allowed: boolean; reason?: string }>,
}))

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => {
    const scope = useEditorScope()
    const access = useEditorAccess()
    return (
      <>
        <p>inside {scope ? `${scope.org}/${scope.project}/${scope.workspace}` : 'nothing'}</p>
        <p>{access.canEdit ? 'can edit' : `view only: ${access.reason}`}</p>
        <p>{`share ${access.canShare} · move ${access.canMove} · deploy ${access.canDeploy}`}</p>
      </>
    )
  },
  Navigate: (props: unknown) => {
    navigated.push(props)
    return null
  },
  useNavigate: () => vi.fn(),
}))
vi.mock('../../workspaces/use-workspace-scope', () => ({
  useWorkspaceScope: () => ({ workspace: { viewerCan: viewer.can } }),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }

beforeEach(() => {
  viewer.can = ADMIN_CAN
})

describe('ItemScopeLayout', () => {
  it('tells everything under a workflow’s URL which workspace it is in', () => {
    render(<ItemScopeLayout org="acme" project="core" workspace="sales" scope={null} />)
    expect(screen.getByText('inside acme/core/sales')).toBeVisible()
    expect(screen.getByText('can edit')).toBeVisible()
    expect(screen.getByText('share true · move true · deploy true')).toBeVisible()
  })

  it('maps an Editor who isn’t a workspace admin to everything but Move', () => {
    viewer.can = { ...viewer.can, manageSettings: { allowed: false } }
    render(<ItemScopeLayout org="acme" project="core" workspace="sales" scope={null} />)
    expect(screen.getByText('share true · move false · deploy true')).toBeVisible()
  })

  it('tells them a Viewer can’t edit, and why', () => {
    viewer.can = {
      edit: { allowed: false, reason: 'Building, deploying and sharing need an Editor' },
      deploy: { allowed: false },
      share: { allowed: false },
      manageSettings: { allowed: false },
    }
    render(<ItemScopeLayout org="acme" project="core" workspace="sales" scope={null} />)
    expect(
      screen.getByText('view only: Building, deploying and sharing need an Editor'),
    ).toBeVisible()
  })

  it('gives a reason even when the API gave none', () => {
    viewer.can = {
      edit: { allowed: false },
      deploy: { allowed: false },
      share: { allowed: false },
      manageSettings: { allowed: false },
    }
    render(<ItemScopeLayout org="acme" project="core" workspace="sales" scope={null} />)
    expect(screen.getByText(`view only: ${VIEW_ONLY_MESSAGE}`)).toBeVisible()
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
