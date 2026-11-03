import { describe, it, expect } from 'vitest'
import {
  bindDefaultExport,
  buildWorkerSource,
  parseQuickTestArgs,
  parseStepModule,
  quickTestRefusal,
  seedEnv,
  seedInputs,
  SERIALIZER_SOURCE,
  stepModuleVarName,
  unresolvableImports,
  unrunnableReason,
} from '../ide/quick-test'

/** The shape `emitStepModule` generates, which is what quick test runs. */
const GENERATED = `/** Step "Fetch user" — generated from the workflow node. */
export default async function fetchUser_step({ env, event, inputs, step }) {
  const { lookup, config } = inputs;
  return { id: lookup.id };
}
`

describe('stepModuleVarName', () => {
  it('recognises a generated step module', () => {
    expect(stepModuleVarName('nodes/fetchUser.ts')).toBe('fetchUser')
    expect(stepModuleVarName('nodes/fetchUser.js')).toBe('fetchUser')
  })

  it('rejects anything that is not one', () => {
    for (const path of [
      'worker.ts',
      'handlers/fetch.ts',
      'nodes/deep/nested.ts',
      'lib/nodes/thing.ts',
      'nodes/not-an-identifier.ts',
      'nodes/thing.json',
    ]) {
      expect(stepModuleVarName(path)).toBeNull()
    }
  })
})

describe('parseStepModule', () => {
  it('reads the names the body takes from inputs', () => {
    expect(parseStepModule(GENERATED).inputNames).toEqual(['lookup', 'config'])
  })

  it('reports no inputs when the body destructures none', () => {
    const source = 'export default async function a_step({ env }) {\n  return 1;\n}\n'
    expect(parseStepModule(source).inputNames).toEqual([])
  })

  it('sees the default export', () => {
    expect(parseStepModule(GENERATED).hasDefaultExport).toBe(true)
    expect(parseStepModule('export function other() {}').hasDefaultExport).toBe(false)
  })

  it('reads an input with a default value', () => {
    // `{ limit = 10 }` is an ordinary thing to write, and splitting on ':'
    // alone dropped it.
    const source =
      'export default async function a_step({ inputs }) {\n  const { limit = 10, page } = inputs;\n}\n'
    expect(parseStepModule(source).inputNames).toEqual(['limit', 'page'])
  })

  it('reads the input key of a nested destructuring, not the inner name', () => {
    // The seed describes `inputs`, so the key is `user`. A regex stopping at
    // the first `}` failed to match this at all and reported no inputs.
    const source =
      'export default async function a_step({ inputs }) {\n  const { user: { id }, raw } = inputs;\n}\n'
    expect(parseStepModule(source).inputNames).toEqual(['user', 'raw'])
  })

  it('reads the input key of a rename', () => {
    const source =
      'export default async function a_step({ inputs }) {\n  const { a: renamed } = inputs;\n}\n'
    expect(parseStepModule(source).inputNames).toEqual(['a'])
  })

  it('ignores a destructuring of something that is not inputs', () => {
    const source =
      'export default async function a_step({ env, inputs }) {\n  const { KEY } = env;\n  const { a } = inputs;\n}\n'
    expect(parseStepModule(source).inputNames).toEqual(['a'])
  })
})

describe('unresolvableImports', () => {
  // Run against transpiled output, so these are JavaScript, not TypeScript.
  it('finds a static import', () => {
    expect(unresolvableImports(`import { z } from 'zod';\n`)).toEqual(['zod'])
  })

  it('finds a bare import', () => {
    expect(unresolvableImports(`import '#app/polyfill';\n`)).toEqual(['#app/polyfill'])
  })

  it('finds a multi-line import', () => {
    expect(unresolvableImports(`import {\n  a,\n  b,\n} from 'zod';\n`)).toEqual(['zod'])
  })

  it('finds a dynamic import, which would fail confusingly inside the worker', () => {
    expect(unresolvableImports('const m = await import("zod");\n')).toEqual(['a dynamic import()'])
  })

  it('finds nothing in output the transpiler has already stripped', () => {
    // A type-only import leaves no trace in the JS, which is the whole
    // reason this runs on the output rather than the source.
    expect(unresolvableImports('const a = 1;\nexport default async function f() {}\n')).toEqual([])
  })

  it('errs toward refusing when the word appears inside a string', () => {
    // A regex, not a parser. Stripping string literals first would fix this
    // but would miss `${import('x')}` in a template — and a missed import
    // reaches the worker and fails confusingly, which is the failure this
    // check exists to prevent. A needless refusal is visible and says why.
    expect(unresolvableImports('const msg = "run import(\'x\')";\n')).toEqual([
      'a dynamic import()',
    ])
  })
})

describe('unrunnableReason', () => {
  // Transpiled output, so JavaScript — which is the point: everything that
  // was only a type is already gone by here.
  it('passes a script with nothing left to resolve', () => {
    expect(unrunnableReason('const a = 1;\nexport default async function f() {}\n')).toBeNull()
  })

  it('names an import it cannot resolve', () => {
    const reason = unrunnableReason(
      `import { z } from 'zod';\nexport default async function f() {}\n`,
    )
    expect(reason).toContain('zod')
    expect(reason).toMatch(/Run/)
  })

  it('refuses an export besides the default', () => {
    // Only the default is rewritten into a binding; anything else is still
    // an `export` statement, which a classic worker refuses to parse.
    expect(unrunnableReason('export const config = { retries: 2 };\n')).toMatch(
      /exports more than its default/i,
    )
    expect(unrunnableReason('export { helper };\n')).toMatch(/exports more than its default/i)
  })

  it('allows the default export it is built around', () => {
    expect(unrunnableReason('export default async function f() {}\n')).toBeNull()
  })

  it('says nothing about types the transpiler already removed', () => {
    // `export type` and `export interface` leave no trace in the output,
    // which is exactly why this reads the output and not the source.
    const transpiled = 'export default async function f() {}\n'
    expect(unrunnableReason(transpiled)).toBeNull()
  })
})

describe('quickTestRefusal', () => {
  it('allows a generated module', () => {
    expect(quickTestRefusal(parseStepModule(GENERATED))).toBeNull()
  })

  it('allows a module with imports, which are judged after transpiling', () => {
    const source = `import type { User } from '#app/types'\n${GENERATED}`
    expect(quickTestRefusal(parseStepModule(source))).toBeNull()
  })

  it('refuses a module with nothing to run', () => {
    expect(quickTestRefusal(parseStepModule('export function other() {}'))).toMatch(
      /no default export/i,
    )
  })
})

describe('parseQuickTestArgs', () => {
  it('parses all three fields', () => {
    const parsed = parseQuickTestArgs({
      inputs: '{"a":1}',
      env: '{"API_URL":"x"}',
      event: '{"payload":{}}',
    })
    expect(parsed).toEqual({
      ok: true,
      args: { inputs: { a: 1 }, env: { API_URL: 'x' }, event: { payload: {} } },
    })
  })

  it('treats an empty field as an empty object', () => {
    const parsed = parseQuickTestArgs({ inputs: '', env: '   ', event: '' })
    expect(parsed).toEqual({ ok: true, args: { inputs: {}, env: {}, event: {} } })
  })

  it('names which field is not valid JSON', () => {
    // All three are on screen at once, so "Not valid JSON" has to be able to
    // point at one of them.
    expect(parseQuickTestArgs({ inputs: '{"a":1}', env: '{nope', event: '{}' })).toEqual({
      ok: false,
      field: 'env',
    })
  })

  it('reports the first bad field rather than the last', () => {
    expect(parseQuickTestArgs({ inputs: 'oops', env: 'also oops', event: '{}' })).toEqual({
      ok: false,
      field: 'inputs',
    })
  })
})

describe('seedInputs', () => {
  it('puts the expected shape on screen', () => {
    expect(seedInputs(['a', 'b'])).toEqual({ a: null, b: null })
  })

  it('is an empty object when the body reads nothing', () => {
    expect(seedInputs([])).toEqual({})
  })
})

describe('seedEnv', () => {
  it('carries plain variables through', () => {
    expect(seedEnv([{ name: 'API_URL', value: 'https://example.test' }])).toEqual({
      API_URL: 'https://example.test',
    })
  })

  it('strips the secret prefix and blanks the value', () => {
    // The stored value is deliberately not seeded: it would land in a
    // textarea for a scratchpad run most steps do not need it for.
    expect(seedEnv([{ name: 'SECRET_TOKEN', value: 'sk-live-123' }])).toEqual({ TOKEN: '' })
  })

  it('blanks a reference to a project variable rather than passing the braces', () => {
    // {{global.env.X}} is resolved when the workflow is prepared. Seeding
    // the literal would hand the step a string of braces and break a
    // fetch(env.API_URL) for reasons that have nothing to do with the step.
    expect(seedEnv([{ name: 'API_URL', value: '{{global.env.API_URL}}' }])).toEqual({
      API_URL: '',
    })
  })

  it('keeps a value that merely mentions braces', () => {
    expect(seedEnv([{ name: 'TEMPLATE', value: 'hello {{name}}' }])).toEqual({
      TEMPLATE: 'hello {{name}}',
    })
  })
})

describe('bindDefaultExport', () => {
  it('turns the default export into a callable binding', () => {
    const bound = bindDefaultExport(GENERATED)
    expect(bound).toContain('const __awaitstep_step = async function fetchUser_step(')
    expect(bound).not.toMatch(/^export\s+default/m)
  })

  it('handles a default export that is not a function declaration', () => {
    expect(bindDefaultExport('export default async ({ inputs }) => inputs\n')).toBe(
      'const __awaitstep_step = async ({ inputs }) => inputs\n',
    )
  })

  it('leaves a later occurrence of the words alone', () => {
    // Only the real default export is rewritten; the same words inside the
    // body are the body's business.
    const source = 'export default function a() {\n  return "export default x";\n}\n'
    const bound = bindDefaultExport(source)
    expect(bound.match(/const __awaitstep_step/g)).toHaveLength(1)
    expect(bound).toContain('return "export default x";')
  })
})

describe('the worker serializer', () => {
  // Built from the same source the worker runs, so these assert the real
  // thing rather than a re-implementation of it.
  const json = new Function(`${SERIALIZER_SOURCE}; return __awaitstep_json`)() as (
    v: unknown,
  ) => string

  it('writes plain values as JSON', () => {
    expect(JSON.parse(json({ a: 1, b: ['x'] }))).toEqual({ a: 1, b: ['x'] })
  })

  it('writes a shared object twice, because sharing is not a cycle', () => {
    // A visited-set marks the second one "[Circular]" and loses real data —
    // which is exactly what the first version did.
    const shared = { id: 1 }
    expect(JSON.parse(json({ a: shared, b: shared }))).toEqual({ a: { id: 1 }, b: { id: 1 } })
  })

  it('writes the same object twice in an array', () => {
    const shared = { id: 1 }
    expect(JSON.parse(json([shared, shared]))).toEqual([{ id: 1 }, { id: 1 }])
  })

  it('marks a real cycle rather than overflowing the stack', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic['self'] = cyclic
    expect(JSON.parse(json(cyclic))).toEqual({ name: 'root', self: '[Circular]' })
  })

  it('marks a cycle through a deeper path', () => {
    const root: Record<string, unknown> = { child: {} }
    ;(root['child'] as Record<string, unknown>)['parent'] = root
    expect(JSON.parse(json(root))).toEqual({ child: { parent: '[Circular]' } })
  })

  it('names functions instead of dropping them', () => {
    expect(json({ run: function named() {} })).toContain('[Function named]')
  })

  it('keeps an error readable', () => {
    const written = JSON.parse(json({ err: new TypeError('bad') })) as {
      err: { name: string; message: string }
    }
    expect(written.err.name).toBe('TypeError')
    expect(written.err.message).toBe('bad')
  })

  it('still catches a cycle that follows an error', () => {
    // The error is replaced by a plain object, and that replacement is what
    // gets walked next — if it is not the one on the ancestor chain, the
    // next unwind empties the stack and the cycle below throws.
    const value: Record<string, unknown> = { err: new TypeError('bad'), nested: {} }
    ;(value['nested'] as Record<string, unknown>)['parent'] = value

    const written = JSON.parse(json(value)) as { nested: { parent: string } }

    expect(written.nested.parent).toBe('[Circular]')
  })

  it('still catches a cycle inside the error branch itself', () => {
    const err = new TypeError('bad') as TypeError & { self?: unknown }
    err.self = err
    expect(() => JSON.parse(json({ err }))).not.toThrow()
  })

  it('writes a bigint, which JSON alone throws on', () => {
    expect(json({ n: 10n })).toContain('"10n"')
  })
})

describe('buildWorkerSource', () => {
  it('leaves no export statement, so it can run as a classic worker', () => {
    expect(buildWorkerSource(GENERATED)).not.toMatch(/^export\b/m)
  })

  it('keeps the module body intact', () => {
    expect(buildWorkerSource(GENERATED)).toContain('return { id: lookup.id };')
  })

  it('calls the step with the arguments the generated shape expects', () => {
    const source = buildWorkerSource(GENERATED)
    expect(source).toContain('__awaitstep_step({')
    for (const key of ['env:', 'event:', 'inputs:', 'step:', 'ctx:']) {
      expect(source).toContain(key)
    }
    expect(source).toContain('{ attempt: 1 }')
  })

  it('stubs the step object rather than leaving it undefined', () => {
    // A body that nests step.do must still run; inline mode had `step`
    // lexically in scope, so the module shape forwards it.
    const source = buildWorkerSource(GENERATED)
    expect(source).toContain('do: async function')
    expect(source).toContain('sleep: async function')
    expect(source).toContain('waitForEvent')
    // Nested step calls receive an attempt, as the real callback does.
    expect(source).toContain('return await fn({ attempt: 1 });')
  })
})
