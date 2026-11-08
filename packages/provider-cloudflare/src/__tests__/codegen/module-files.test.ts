import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { GenerateInputError } from '@awaitstep/codegen'
import { assertStepPathsFree, moduleImportLine, modulePathOf } from '@awaitstep/codegen'

function step(id: string, name = id, inline = false): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cf',
    data: { code: 'return 1;', ...(inline && { inline: true }) },
  }
}

describe('moduleImportLine', () => {
  it('imports a step module by its binding and a template module by its base name, from the compiled path', () => {
    expect(
      moduleImportLine(
        { path: 'steps/s-1.ts', source: '', role: 'module', binding: '$Fetch_data' },
        '#app/',
      ),
    ).toBe('import $Fetch_data from "#app/steps/s-1.js";')
    expect(moduleImportLine({ path: 'nodes/Mailer.ts', source: '', role: 'module' }, './')).toBe(
      'import $Mailer from "./nodes/Mailer.js";',
    )
  })

  it('refuses a module at a path it cannot name an import for', () => {
    expect(() =>
      moduleImportLine({ path: 'lib/helper.ts', source: '', role: 'module' }, '../'),
    ).toThrow('Generated module has unexpected path: lib/helper.ts')
  })
})

describe('modulePathOf', () => {
  it('finds a step’s own file or a template node’s generated one, or nothing', () => {
    const files = [
      { path: 'steps/a.ts', source: '', role: 'module' as const },
      { path: 'nodes/B.ts', source: '', role: 'module' as const },
      { path: 'steps/c.ts', source: '', role: 'source' as const },
    ]
    expect(modulePathOf(files, { id: 'a' }, 'A')).toBe('steps/a.ts')
    expect(modulePathOf(files, { id: 'b' }, 'B')).toBe('nodes/B.ts')
    expect(modulePathOf(files, { id: 'c' }, 'C')).toBeNull()
  })
})

describe('assertStepPathsFree', () => {
  it('names the step whose module path a project file occupies, and passes otherwise', () => {
    const ir = {
      nodes: [step('fetch', 'Fetch user'), step('raw', 'Raw', true)],
      runtime: { files: [{ path: 'steps/fetch.ts' }, { path: 'steps/raw.ts' }] },
    }
    expect(() => assertStepPathsFree(ir)).toThrow(GenerateInputError)
    expect(() => assertStepPathsFree(ir)).toThrow(
      'Project file "steps/fetch.ts" is where the module of step "Fetch user" goes — rename or delete the file',
    )
    expect(() =>
      assertStepPathsFree({ nodes: ir.nodes, runtime: { files: [{ path: 'steps/other.ts' }] } }),
    ).not.toThrow()
    expect(() => assertStepPathsFree({ nodes: ir.nodes })).not.toThrow()
  })
})
