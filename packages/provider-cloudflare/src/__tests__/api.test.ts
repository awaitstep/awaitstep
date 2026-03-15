import { describe, it, expect } from 'vitest'
import { CloudflareAPI } from '../api.js'

describe('CloudflareAPI input validation', () => {
  const api = new CloudflareAPI({ accountId: 'test-account', apiToken: 'test-token' })

  it('rejects workflowName with path traversal', async () => {
    await expect(api.createInstance('../../evil')).rejects.toThrow('Invalid workflowName')
  })

  it('rejects instanceId with dots', async () => {
    await expect(api.getInstanceStatus('my-workflow', 'some.bad.id')).rejects.toThrow(
      'Invalid instanceId',
    )
  })

  it('rejects workflowName with slashes', async () => {
    await expect(api.getInstanceStatus('my/workflow', 'valid-id')).rejects.toThrow(
      'Invalid workflowName',
    )
  })

  it('rejects empty instanceId', async () => {
    await expect(api.getInstanceStatus('my-workflow', '')).rejects.toThrow('Invalid instanceId')
  })

  it('accepts valid alphanumeric-hyphen-underscore values', async () => {
    // This will fail with a network error (no real API), but should NOT
    // fail with a validation error — that's what we're testing
    const result = api.createInstance('my-workflow_v2', undefined, 'instance-123_abc')
    await expect(result).rejects.not.toThrow('Invalid')
  })

  it('validates accountId at construction time', () => {
    expect(() => new CloudflareAPI({ accountId: '../evil', apiToken: 'token' })).toThrow(
      'Invalid accountId',
    )
  })
})
