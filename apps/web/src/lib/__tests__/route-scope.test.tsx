import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, projectUrl } from '../api-client'
import { enterRouteScope, leaveRouteScope, routeScopeKey } from '../workflows/route-scope'
import { useOrgReady, useOrgStore } from '../../stores/org-store'
import type { ScopeLookup } from '../../types/dashboard/scope'
import { renderHook } from '@testing-library/react'

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }
const OPS = { org: 'acme', project: 'core', workspace: 'ops' }

function found(orgId: string, projectId: string): ScopeLookup {
  return {
    found: true,
    org: { org: { id: orgId } },
    project: { project: { id: projectId } },
    workspace: { workspace: { id: 'ws_1' } },
  } as unknown as ScopeLookup
}

const missing: ScopeLookup = {
  found: false,
  notFound: { kind: 'workspace', slug: 'salez', parent: null },
}

/** A lookup the test answers when it chooses, to put responses out of order. */
function deferred() {
  let answer!: (scope: ScopeLookup) => void
  const promise = new Promise<ScopeLookup>((resolve) => (answer = resolve))
  return { lookup: () => promise, answer }
}

function seedSwitcher() {
  useOrgStore.setState({
    appReady: true,
    activeOrganizationId: 'org_old',
    activeProjectId: 'prj_first',
    projects: [],
    routeScope: null,
  })
}

afterEach(() => {
  leaveRouteScope()
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
})

describe('enterRouteScope', () => {
  it('points API calls at the URL’s project, not the switcher’s', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_second') })

    const state = useOrgStore.getState()
    expect(state.routeScope).toEqual({
      key: routeScopeKey(SALES),
      organizationId: 'org_acme',
      projectId: 'prj_second',
      workspaceId: 'ws_1',
    })
    expect(state.activeOrganizationId).toBe('org_acme')
    expect(state.activeProjectId).toBe('prj_second')
    expect(projectUrl('/workflows/wf_1')).toContain('projectId=prj_second')
  })

  it('sends org-level calls to the URL’s org too', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_second') })
    useOrgStore.setState({ activeOrganizationId: 'org_old' })
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [], nextCursor: null })))
    await api.listProjects()
    expect(String(fetch.mock.calls[0]![0])).toContain('organizationId=org_acme')
  })

  it('wins over a switcher that later moves to another project', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_second') })
    useOrgStore.getState().setActiveProject('prj_first')
    expect(projectUrl('/workflows/wf_1')).toContain('projectId=prj_second')
  })

  it('looks the scope up once per workspace, not on every view switch', async () => {
    seedSwitcher()
    const lookup = vi.fn(async () => found('org_acme', 'prj_second'))
    await enterRouteScope(SALES, { lookup })
    await enterRouteScope(SALES, { lookup })
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('drops the last workspace’s scope when the next one can’t be opened', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_second') })
    await enterRouteScope({ ...SALES, workspace: 'salez' }, { lookup: async () => missing })
    expect(useOrgStore.getState().routeScope).toBeNull()
  })

  it('keeps the newest workspace when an older lookup answers last', async () => {
    seedSwitcher()
    const sales = deferred()
    const ops = deferred()
    const first = enterRouteScope(SALES, { lookup: sales.lookup })
    const second = enterRouteScope(OPS, { lookup: ops.lookup })
    ops.answer(found('org_acme', 'prj_ops'))
    await second
    sales.answer(found('org_acme', 'prj_sales'))
    await first
    expect(useOrgStore.getState().routeScope?.key).toBe(routeScopeKey(OPS))
    expect(projectUrl('/x')).toContain('projectId=prj_ops')
  })

  it('applies nothing for a cancelled navigation', async () => {
    seedSwitcher()
    const controller = new AbortController()
    const pending = deferred()
    const entering = enterRouteScope(SALES, { lookup: pending.lookup, signal: controller.signal })
    controller.abort()
    pending.answer(found('org_acme', 'prj_second'))
    await entering
    expect(useOrgStore.getState().routeScope).toBeNull()
    expect(useOrgStore.getState().activeProjectId).toBe('prj_first')
  })

  it('sets nothing for a scope the viewer can’t open', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => missing })
    expect(useOrgStore.getState().routeScope).toBeNull()
    expect(useOrgStore.getState().activeProjectId).toBe('prj_first')
  })
})

describe('leaveRouteScope', () => {
  it('hands API calls back to the switcher', async () => {
    seedSwitcher()
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_second') })
    leaveRouteScope()
    useOrgStore.getState().setActiveProject('prj_first')
    expect(projectUrl('/workflows')).toContain('projectId=prj_first')
  })

  it('drops a lookup still in flight, so nothing leaks past the editor', async () => {
    seedSwitcher()
    const pending = deferred()
    const entering = enterRouteScope(SALES, { lookup: pending.lookup })
    leaveRouteScope()
    pending.answer(found('org_acme', 'prj_second'))
    await entering
    expect(useOrgStore.getState().routeScope).toBeNull()
  })
})

describe('readiness', () => {
  it('is ready on the URL’s project even when the switcher’s list doesn’t hold it', async () => {
    seedSwitcher()
    expect(renderHook(() => useOrgReady()).result.current).toBe(false)
    await enterRouteScope(SALES, { lookup: async () => found('org_acme', 'prj_page_3') })
    expect(renderHook(() => useOrgReady()).result.current).toBe(true)
  })
})
