import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimLocalDevSession,
  currentLocalDevSession,
  releaseLocalDevSession,
  resetLocalDevSession,
} from '../lib/local-dev-sessions.js'

const A = { workflowId: 'wf-a', organizationId: 'org-a', provider: 'cloudflare' }
const B = { workflowId: 'wf-b', organizationId: 'org-b', provider: 'cloudflare' }

beforeEach(() => resetLocalDevSession())

describe('local dev session ownership', () => {
  it('refuses a second workflow or organization', () => {
    expect(claimLocalDevSession(A)).toEqual({ ok: true, replaced: false })
    expect(claimLocalDevSession(B)).toEqual({ ok: false, active: A })
    expect(currentLocalDevSession(B.workflowId, B.organizationId)).toBeNull()
  })

  it('lets the same workflow restart, and only the owner release', () => {
    claimLocalDevSession(A)
    expect(claimLocalDevSession(A)).toEqual({ ok: true, replaced: true })
    expect(releaseLocalDevSession(B.workflowId, B.organizationId)).toBeNull()
    expect(currentLocalDevSession(A.workflowId, A.organizationId)).toEqual(A)
    expect(releaseLocalDevSession(A.workflowId, A.organizationId)).toEqual(A)
    expect(currentLocalDevSession(A.workflowId, A.organizationId)).toBeNull()
  })
})
