import { describe, expect, it } from 'vitest'
import { GENERATED_NAMES } from '@awaitstep/ir'
import { GenerateInputError } from '../errors.js'
import { importBindings, importOrigin, mergeImports } from '../imports.js'
import { functionRuntimeImport, workflowRuntimeImport } from '../runtime.js'
import { computeVarNames } from '../context.js'

const RUNTIME = 'import { defineWorkflow, durableStep, stepArgs } from "#awaitstep/runtime";'

describe('mergeImports', () => {
  it('folds a name the generated file already imports into its line', () => {
    expect(
      mergeImports([
        { statement: RUNTIME },
        { statement: 'import { durableStep } from "#awaitstep/runtime"', origin: '"a"' },
      ]),
    ).toEqual([RUNTIME])
  })

  it('merges named imports of one module into one statement', () => {
    expect(
      mergeImports([
        { statement: RUNTIME },
        { statement: "import { HttpError, type StepContext } from '#awaitstep/runtime'" },
      ]),
    ).toEqual([
      'import { defineWorkflow, durableStep, stepArgs, HttpError, type StepContext } from "#awaitstep/runtime";',
    ])
  })

  it('keeps a type-only merge type-only, and a value import wins over a type one', () => {
    expect(
      mergeImports([
        { statement: 'import type { A } from "x";' },
        { statement: 'import type { B } from "x";' },
      ]),
    ).toEqual(['import type { A, B } from "x";'])
    expect(
      mergeImports([
        { statement: 'import type { A } from "x";' },
        { statement: 'import { A, B } from "x";' },
      ]),
    ).toEqual(['import { A, B } from "x";'])
  })

  it('keeps default and namespace imports as their own statements', () => {
    expect(
      mergeImports([
        { statement: 'import z, { a } from "zod";' },
        { statement: 'import * as all from "zod";' },
        { statement: 'import { b } from "zod";' },
      ]),
    ).toEqual([
      'import z from "zod";',
      'import * as all from "zod";',
      'import { a, b } from "zod";',
    ])
  })

  it('keeps a module only one statement imports as written, and side-effect imports once', () => {
    expect(
      mergeImports([
        { statement: "import { z } from 'zod'" },
        { statement: 'import "./polyfill"' },
        { statement: 'import "./polyfill"' },
      ]),
    ).toEqual(["import { z } from 'zod'", 'import "./polyfill"'])
  })

  it('refuses one name from two modules, naming the node and both modules', () => {
    const merge = () =>
      mergeImports([
        { statement: RUNTIME },
        { statement: 'import { stepArgs } from "some-pkg"', origin: '"Prepare"' },
      ])
    expect(merge).toThrow(GenerateInputError)
    expect(merge).toThrow(
      '"Prepare" imports `stepArgs` from "some-pkg", but the generated code already imports it from "#awaitstep/runtime". Rename it with `as`.',
    )
  })

  it('refuses one name bound to two exports of the same module', () => {
    expect(() =>
      mergeImports([
        { statement: 'import { a as x } from "m";', origin: '"One"' },
        { statement: 'import { b as x } from "m";', origin: '"Two"' },
      ]),
    ).toThrow(/"Two" imports `x`.*but "One" already imports it/)
  })

  it('accepts a renamed import of a generated name', () => {
    expect(
      mergeImports([
        { statement: RUNTIME },
        { statement: 'import { stepArgs as pkgArgs } from "some-pkg"' },
      ]),
    ).toEqual([RUNTIME, 'import { stepArgs as pkgArgs } from "some-pkg"'])
  })
})

describe('mergeImports: review fixes', () => {
  it('lets two type-only imports of one name from different modules through', () => {
    expect(
      mergeImports([
        { statement: 'import { type Env, runGraph } from "#awaitstep/function";' },
        { statement: 'import type { Env } from "./types";', origin: 'The trigger code' },
      ]),
    ).toEqual([
      'import { type Env, runGraph } from "#awaitstep/function";',
      'import type { Env } from "./types";',
    ])
  })

  it('reads an import with comments, so it still merges and clashes', () => {
    expect(
      mergeImports([
        { statement: 'import { a } from "x"; // note' },
        { statement: 'import { a } from "x"' },
      ]),
    ).toEqual(['import { a } from "x";'])
    expect(
      mergeImports([
        { statement: 'import {\n  a, // first\n  /* b */ c,\n} from "x"' },
        { statement: 'import { d } from "x"' },
      ]),
    ).toEqual(['import { a, c, d } from "x";'])
    expect(() =>
      mergeImports([
        { statement: 'import { a } from "x"' },
        { statement: 'import { a } from "y"; // other', origin: '"S"' },
      ]),
    ).toThrow(/"S" imports `a` from "y"/)
    expect(mergeImports([{ statement: 'import x from "https://esm.sh/x"' }])).toEqual([
      'import x from "https://esm.sh/x"',
    ])
  })

  it('names a step inside a container as such, and the second party in lower case', () => {
    expect(importOrigin({ type: 'step', name: 'Prep' })).toBe('"Prep"')
    expect(importOrigin({ type: 'loop', name: 'Each user' })).toBe('A step in "Each user"')
    expect(() =>
      mergeImports([
        { statement: 'import { a } from "x"', origin: 'The trigger code' },
        { statement: 'import { a } from "y"' },
      ]),
    ).toThrow('but the trigger code already imports it from "x"')
  })
})

describe('mergeImports: long input', () => {
  it('reads a long or malformed import in time linear in its length', () => {
    const started = performance.now()
    for (const n of [2_000, 4_000, 250_000]) {
      const statement = 'import' + ' '.repeat(n) + 'from "y" z'
      expect(importBindings(statement)).toEqual([])
      expect(mergeImports([{ statement }])).toEqual([statement])
    }
    // The old pattern took seconds at 2,000 and never finished at 10,000.
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('keeps an import longer than the cap as written', () => {
    const names = Array.from({ length: 1_000 }, (_, i) => `n${i}`).join(', ')
    const statement = `import { ${names} } from "x"`
    expect(importBindings(statement)).toEqual([])
    expect(mergeImports([{ statement }, { statement }])).toEqual([statement])
  })

  it('still reads `type` as a default import name', () => {
    expect(importBindings('import type from "x"')).toMatchObject([
      { local: 'type', imported: 'default', typeOnly: false },
    ])
    expect(importBindings('import type, { a } from "x"').map((b) => b.local)).toEqual(['a', 'type'])
    expect(importBindings('import type T from "x"')).toMatchObject([{ local: 'T', typeOnly: true }])
    expect(importBindings('import {a}from"x"')).toMatchObject([{ local: 'a', specifier: 'x' }])
  })
})

describe('importBindings', () => {
  it('lists every local name a statement binds', () => {
    expect(importBindings('import D, { a, b as c, type T } from "m"').map((b) => b.local)).toEqual([
      'a',
      'c',
      'T',
      'D',
    ])
    expect(importBindings('import * as N from "m"')[0]).toMatchObject({ local: 'N', imported: '*' })
    expect(importBindings('import "side-effect"')).toEqual([])
  })
})

describe('generated names', () => {
  it('include every name the generated runtime imports bind', () => {
    const lines = [
      workflowRuntimeImport({ callsStepModules: true, hasWait: true }),
      functionRuntimeImport({ needsHost: true, hasSubCalls: true, callsStepModules: true }),
    ]
    for (const line of lines) {
      // A type import (`PlatformHost`) is erased and can't clash with a value.
      for (const { local, typeOnly } of importBindings(line)) {
        if (!typeOnly) expect(GENERATED_NAMES).toContain(local)
      }
    }
  })

  it('leave module-level names a step may still be called by', () => {
    const names = computeVarNames(
      ['startWorkflow', 'workflowStatus', 'Env', 'PlatformHost', 'step'].map((name) => ({
        id: name,
        name,
      })),
    )
    expect([...names.values()]).toEqual([
      'startWorkflow',
      'workflowStatus',
      'Env',
      'PlatformHost',
      'step_node',
    ])
  })
})
