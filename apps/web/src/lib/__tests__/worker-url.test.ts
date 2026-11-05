import { describe, expect, it } from 'vitest'
import { workerUrl } from '../workflows/worker-url'

describe('workerUrl', () => {
  it('offers an https worker URL', () => {
    expect(workerUrl('https://awaitstep-abc.workers.dev')).toBe('https://awaitstep-abc.workers.dev')
  })

  it('offers nothing else', () => {
    expect(workerUrl('javascript:alert(1)')).toBeNull()
    expect(workerUrl('http://example.test')).toBeNull()
    expect(workerUrl('not a url')).toBeNull()
    expect(workerUrl(null)).toBeNull()
  })
})
