import { describe, it, expect } from 'vitest'
import { BUILTIN_NODE_TYPE_LIST } from '@awaitstep/ir'
import { builtinGenerators } from '../../codegen/generator-registry.js'

describe('builtinGenerators', () => {
  it('registers a generator for every builtin node type — no drift', () => {
    expect(builtinGenerators.types().sort()).toEqual([...BUILTIN_NODE_TYPE_LIST].sort())
  })
})
