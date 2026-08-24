import { describe, it, expect } from 'vitest'
import { GeneratorRegistry } from '../node-generator.js'

const stub = (type: string) => ({ type, generate: () => `// ${type}` })

describe('GeneratorRegistry', () => {
  it('registers and looks up generators by type', () => {
    const registry = new GeneratorRegistry().register(stub('step')).register(stub('sleep'))
    expect(registry.get('step')?.generate).toBeTypeOf('function')
    expect(registry.get('sleep')?.generate).toBeTypeOf('function')
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('rejects duplicate registrations', () => {
    const registry = new GeneratorRegistry().register(stub('step'))
    expect(() => registry.register(stub('step'))).toThrow('already registered')
  })
})
