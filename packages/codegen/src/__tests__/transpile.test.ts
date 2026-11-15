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

describe('transpileToJS on deeply nested code', () => {
  it('says 200k nested braces are nested too deeply, and where, quickly', async () => {
    const started = performance.now()
    await expect(transpileToJS(`const x = 1\n${'{'.repeat(200_000)}`)).rejects.toThrow(
      'Nested too deeply to compile: 200000 levels of brackets (2:199999)',
    )
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('says deep parentheses are nested too deeply', async () => {
    await expect(transpileToJS(`x = ${'('.repeat(5000)}1${')'.repeat(5000)}`)).rejects.toThrow(
      'Nested too deeply to compile: 5000 levels of brackets (1:',
    )
  })

  it('names any other shape that exhausts the stack, not the stack', async () => {
    const error = await transpileToJS(`x = ${'!'.repeat(50_000)}1`).catch((e: Error) => e)
    expect((error as Error).message).toBe('Nested too deeply to compile: simplify the code')
  })

  it('compiles code with hundreds of regexes holding brackets and quotes', async () => {
    const lines = Array.from(
      { length: 300 },
      (_, n) =>
        `export const q${n} = (s: string) => s.split(/"/).length + (/\\(/.test(s) ? 1 : 0) + (/[{]/.test(s) ? 1 : 0)`,
    )
    await expect(transpileToJS(lines.join('\n'))).resolves.toContain('q299')
  })

  it('compiles ordinary nesting', async () => {
    const depth = 50
    await expect(
      transpileToJS(`const x = ${'['.repeat(depth)}1${']'.repeat(depth)}`),
    ).resolves.toContain('const x')
  })
})
