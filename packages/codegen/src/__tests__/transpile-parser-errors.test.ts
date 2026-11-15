import { describe, expect, it, vi } from 'vitest'

const thrown = vi.hoisted(() => ({ error: new Error('') as Error }))

vi.mock('sucrase', () => ({
  transform: () => {
    throw thrown.error
  },
}))

const { transpileToJS } = await import('../transpile.js')

describe('transpileToJS when the parser throws', () => {
  it('says Firefox’s too much recursion is code nested too deeply', async () => {
    const error = new Error('too much recursion')
    error.name = 'InternalError'
    thrown.error = error
    await expect(transpileToJS('x = !!!1')).rejects.toThrow(
      'Nested too deeply to compile: simplify the code',
    )
  })

  it('passes a range error that is not the stack through as it is', async () => {
    thrown.error = new RangeError('Invalid string length')
    await expect(transpileToJS('x = 1')).rejects.toThrow('Invalid string length')
  })
})
