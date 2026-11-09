import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimLocalDevSession,
  recordLocalDevRuntime,
  currentLocalDevSession,
  releaseLocalDevSession,
  resetLocalDevSession,
} from '../lib/local-dev-sessions.js'

const A = { workflowId: 'wf-a', organizationId: 'org-a', provider: 'cloudflare' }
const B = { workflowId: 'wf-b', organizationId: 'org-b', provider: 'cloudflare' }

beforeEach(() => resetLocalDevSession())

describe('local dev session ownership', () => {
  it('refuses a second workflow or organization', () => {
    expect(claimLocalDevSession(A)).toMatchObject({ ok: true, replaced: false })
    expect(claimLocalDevSession(B)).toMatchObject({ ok: false, active: A })
    expect(currentLocalDevSession(B.workflowId, B.organizationId)).toBeNull()
  })

  it('records the mode and runtime for reopening the panel', () => {
    expect(claimLocalDevSession({ ...A, mode: 'ide' })).toMatchObject({
      ok: true,
      session: { mode: 'ide', port: null },
    })
    recordLocalDevRuntime(A.workflowId, A.organizationId, {
      port: 8787,
      url: 'http://localhost:8787',
      pid: 42,
    })
    expect(currentLocalDevSession(A.workflowId, A.organizationId)).toMatchObject({
      mode: 'ide',
      port: 8787,
      url: 'http://localhost:8787',
      pid: 42,
    })
  })

  it('lets the same workflow restart, and only the owner release', () => {
    claimLocalDevSession(A)
    expect(claimLocalDevSession(A)).toMatchObject({ ok: true, replaced: true })
    expect(releaseLocalDevSession(B.workflowId, B.organizationId)).toBeNull()
    expect(currentLocalDevSession(A.workflowId, A.organizationId)).toMatchObject(A)
    expect(releaseLocalDevSession(A.workflowId, A.organizationId)).toMatchObject(A)
    expect(currentLocalDevSession(A.workflowId, A.organizationId)).toBeNull()
  })
})
