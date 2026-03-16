import { describe, it, expect } from 'vitest'
import { transpileToJS } from '../transpile.js'

describe('transpileToJS', () => {
  it('transpiles TypeScript to valid JS', async () => {
    const ts = `const x: number = 1;\nexport default x;`
    const js = await transpileToJS(ts)
    expect(js).toBeTruthy()
    expect(js).not.toContain(': number')
    expect(js).toContain('export')
  })

  it('produces ESM output', async () => {
    const ts = `export class Foo { bar(): string { return "hello"; } }`
    const js = await transpileToJS(ts)
    expect(js).toContain('export')
    expect(js).toContain('class Foo')
  })
})
