import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api-client'
import { useOrgStore } from '../../stores/org-store'

// An id from the URL arrives decoded: `%3F` is `?`, `%2F` is `/`, `%23` is `#`.
const HOSTILE = 'wf_1?projectId=prj_other#'

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useOrgStore.setState({ activeOrganizationId: 'org_1', activeProjectId: 'prj_1' })
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
})

afterEach(() => {
  vi.restoreAllMocks()
  useOrgStore.getState().clear()
})

function requested(): string {
  return String(fetchSpy.mock.calls[0]![0])
}

describe('API paths built from ids', () => {
  it('keeps an id one path segment, so it can’t rewrite the query or the route', async () => {
    await api.getWorkflowFull(HOSTILE, '../v?x#')
    const url = requested()
    expect(url).toContain(`/workflows/${encodeURIComponent(HOSTILE)}/full?`)
    expect(url).toContain(`version=${encodeURIComponent('../v?x#')}`)
    expect(url).toMatch(/projectId=prj_1$/)
    expect(url).not.toContain('#')
  })

  it('encodes nested ids as well', async () => {
    await api.getWorkflowRun('../projects/p1', 'r/1')
    expect(requested()).toContain('/workflows/..%2Fprojects%2Fp1/runs/r%2F1?projectId=prj_1')
  })
})
