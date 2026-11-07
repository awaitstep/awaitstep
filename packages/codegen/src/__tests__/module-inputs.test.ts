import { describe, expect, it } from 'vitest'
import { moduleInputNames, moduleInputReads } from '../module-inputs.js'

const names = (code: string) => [...moduleInputReads(code).names].sort()

describe('moduleInputReads', () => {
  it('finds member, index and destructured reads of inputs, not comments', () => {
    const code = `export default async function a({ env, event, inputs, step, ctx }) {
  const { a, b: alias, c = 1 } = inputs;
  const x = inputs.d + inputs?.e + inputs["f"] + inputs['g'];
  // inputs.commented and inputs
  return x;
}`
    expect(names(code)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(moduleInputReads(code).all).toBe(false)
    expect(moduleInputReads('return 1;').names.size).toBe(0)
  })

  it('reads the input key of a nested destructuring, a default and a rename, not the inner names', () => {
    // `{ limit = 10 }` and `{ user: { id } }` are ordinary things to write; a
    // regex stopping at the first `}` dropped the first and failed on the second.
    const code =
      'export default async function a_step({ inputs }) {\n  const { user: { id }, limit = 10, a: renamed } = inputs;\n  return id;\n}\n'
    expect(names(code)).toEqual(['a', 'limit', 'user'])
  })

  it('ignores a destructuring of something that is not inputs, and a member of a member', () => {
    const code =
      'export default async function a_step({ env, inputs }) {\n  const { KEY } = env;\n  const { id } = inputs.fetch_user;\n  return KEY;\n}\n'
    expect(names(code)).toEqual(['fetch_user'])
    expect(moduleInputReads(code).all).toBe(false)
  })

  it('reads the keys a parameter destructures out of inputs', () => {
    const code =
      'export default async function x({ env, inputs: { a, b: alias } }) {\n  return a + alias;\n}\n'
    expect(names(code)).toEqual(['a', 'b'])
    expect(moduleInputReads(code).all).toBe(false)
  })

  it('reports that every name may be read when inputs is used whole, spread, rest-gathered or renamed', () => {
    for (const code of [
      'export default async function x({ inputs }) {\n  return helper(inputs);\n}\n',
      'export default async function x({ inputs }) {\n  return { ...inputs };\n}\n',
      'export default async function x({ inputs }) {\n  const { a, ...rest } = inputs;\n  return rest;\n}\n',
      'export default async function x({ inputs: args }) {\n  return args.a;\n}\n',
      'export default async function x({ inputs }) {\n  const key = "a";\n  return inputs[key];\n}\n',
    ]) {
      expect(moduleInputReads(code).all, code).toBe(true)
    }
    // The parameter binding alone is not a read of everything.
    expect(moduleInputReads('export default async function x({ env, inputs }) {}').all).toBe(false)
  })

  it('exposes the names alone for callers that only need them', () => {
    expect([...moduleInputNames('return inputs.a + inputs.b;')].sort()).toEqual(['a', 'b'])
  })
})

describe('moduleInputReads scans once, whatever the code looks like (security review round 1)', () => {
  it('finishes a file of dangling `}= inputs` and of `inputs` before a long gap in linear time', () => {
    const started = Date.now()
    const dangling = moduleInputReads('}= inputs\n'.repeat(20_000))
    expect(dangling.all).toBe(true)
    const gap = moduleInputReads(
      'export default async function x({ inputs }) {\n  return inputs' +
        ' '.repeat(50_000) +
        '.a;\n}\n',
    )
    expect([...gap.names]).toEqual(['a'])
    expect(Date.now() - started).toBeLessThan(1_500)
  })

  it('does not read inputs mentioned in a string or a comment', () => {
    const code =
      'export default async function x({ env, event, inputs, step, ctx }) {\n  // inputs.commented\n  const s = "inputs.quoted";\n  return inputs["real"] + s;\n}\n'
    const reads = moduleInputReads(code)
    expect([...reads.names]).toEqual(['real'])
    expect(reads.all).toBe(false)
  })
})
