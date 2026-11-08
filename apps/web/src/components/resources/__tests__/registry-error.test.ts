import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import { registryDetail } from '../registry-error'

describe('registryDetail', () => {
  it('explains a missing or unreachable registry, and says nothing about other errors', () => {
    const unreachable = 'This instance can’t reach the node registry.'
    expect(registryDetail(new ApiError('unavailable', 503))).toContain(unreachable)
    expect(registryDetail(new ApiError('not found', 404))).toBeUndefined()
    expect(registryDetail(new Error('offline'))).toBeUndefined()
  })
})
