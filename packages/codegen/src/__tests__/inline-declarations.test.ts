import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { inlineStepNames, topLevelDeclarations } from '../inline-declarations.js'

describe('topLevelDeclarations: long input', () => {
  it('scans a step-sized declaration list in linear time', () => {
    const started = performance.now()
    topLevelDeclarations('const '.repeat(250_000 / 6))
    topLevelDeclarations('let a = 1, '.repeat(20_000))
    // The first scan took seconds at 25,000 characters before.
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('reads very deep destructuring as binding nothing instead of overflowing', () => {
    expect(() =>
      topLevelDeclarations('const ' + '['.repeat(10_000) + ']'.repeat(10_000)),
    ).not.toThrow()
    expect(topLevelDeclarations('const [[[a]]] = x')).toEqual(['a'])
  })
})

describe('topLevelDeclarations', () => {
  it('lists what the code declares at its top level', () => {
    expect(
      topLevelDeclarations(
        'const a = 1\nlet { b, c: d = 2, ...e } = o, [f, [g]] = p\nfunction* gen() { const no = 1 }\nclass K {}\nfoo()\nfunction later() {}\nexport async function h() {}',
      ),
    ).toEqual(['a', 'b', 'd', 'e', 'f', 'g', 'gen', 'K', 'later', 'h'])
  })
})

describe('topLevelDeclarations: regular expression literals', () => {
  it('does not let a bracket inside a regex move the depth', () => {
    expect(
      topLevelDeclarations('function f() { const r = /}/; const inner = 1 }\nconst x = 1'),
    ).toEqual(['f', 'x'])
    expect(topLevelDeclarations('const re = /[{]/\nconst after = 1')).toEqual(['re', 'after'])
    expect(topLevelDeclarations('const t = s.match(/\\/{/)\nconst z = 2')).toEqual(['t', 'z'])
  })

  it('scans a step-sized line of unclosed regex starts in linear time', () => {
    const started = performance.now()
    topLevelDeclarations('=/['.repeat(83_000))
    // Each unclosed `/[` rescanned the rest of its line before: about 40 s.
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('still reads a slash after a value as division', () => {
    expect(topLevelDeclarations('const half = a / 2\nconst b = (c) / 3\nconst d = 4')).toEqual([
      'half',
      'b',
      'd',
    ])
  })
})

describe('inlineStepNames', () => {
  const step = (code: string, inline = true): WorkflowNode => ({
    id: 's',
    type: 'step',
    name: 'S',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code, inline },
  })

  it("lists an inline step's top-level names once, without its imports", () => {
    expect(
      inlineStepNames(
        step(
          "import { getFakeUser } from '#modules/faker'\n\nconst user = getFakeUser()\nconst { id, email } = user\nlet user2 = 1, user3\nif (user) { const hidden = 1 }",
        ),
      ),
    ).toEqual(['user', 'id', 'email', 'user2', 'user3'])
  })

  it('passes on no reserved word: an anonymous class that extends reads as one', () => {
    expect(inlineStepNames(step('export default class extends Base {}\nconst ok = 1'))).toEqual([
      'ok',
    ])
  })

  it('binds nothing for a step that is not inline', () => {
    expect(inlineStepNames(step('const user = 1', false))).toEqual([])
  })
})
