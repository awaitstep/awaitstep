import { describe, expect, it } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generatedNameProblems, topLevelDeclarations } from '../generated-name-problems.js'

function node(
  id: string,
  type: string,
  name: string,
  data: Record<string, unknown>,
): WorkflowIR['nodes'][number] {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const META = { name: 'w', version: 1, createdAt: '', updatedAt: '' }

function loopAround(itemVar: string, bodyName: string): WorkflowIR {
  return {
    metadata: META,
    nodes: [
      node('each', 'loop', 'each', { loopType: 'forEach', collection: '[1]', itemVar }),
      node('w', 'step', bodyName, { code: 'return 1' }),
    ],
    edges: [{ id: 'e1', source: 'each', target: 'w', label: 'body' }],
    entryNodeId: 'each',
  }
}

function inline(code: string, ...others: WorkflowIR['nodes']): WorkflowIR {
  return {
    metadata: META,
    nodes: [node('i', 'step', 'Prepare', { code, inline: true }), ...others],
    edges: [],
    entryNodeId: 'i',
  }
}

describe('generatedNameProblems: loop items', () => {
  it('finds a loop item named like a step inside the loop, on the loop', () => {
    expect(generatedNameProblems(loopAround('work', 'work'))).toEqual([
      {
        path: 'nodes.each.data.itemVar',
        nodeId: 'each',
        message: 'Loop "each" item name `work` is also step "work" inside this loop. Rename one.',
      },
    ])
  })

  it('clears when either is renamed', () => {
    expect(generatedNameProblems(loopAround('job', 'work'))).toEqual([])
    expect(generatedNameProblems(loopAround('work', 'do work'))).toEqual([])
  })

  it('finds a step nested deeper inside the loop', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('outer', 'loop', 'outer', { loopType: 'forEach', collection: '[1]', itemVar: 'work' }),
        node('inner', 'loop', 'inner', { loopType: 'forEach', collection: '[1]', itemVar: 'x' }),
        node('w', 'step', 'work', { code: 'return 1' }),
      ],
      edges: [
        { id: 'e1', source: 'outer', target: 'inner', label: 'body' },
        { id: 'e2', source: 'inner', target: 'w', label: 'body' },
      ],
      entryNodeId: 'outer',
    }
    expect(generatedNameProblems(ir).map((p) => p.nodeId)).toEqual(['outer'])
  })

  it('ignores a step of that name outside the loop', () => {
    const ir = loopAround('work', 'other')
    ir.nodes.push(node('o', 'step', 'work', { code: 'return 1' }))
    expect(generatedNameProblems(ir)).toEqual([])
  })

  it('ignores a node inside the loop that binds no value (a sleep, a step without a return)', () => {
    const sleep = loopAround('pause', 'other')
    sleep.nodes.push(node('p', 'sleep', 'pause', { duration: '1 second' }))
    sleep.edges.push({ id: 'e2', source: 'w', target: 'p' })
    expect(generatedNameProblems(sleep)).toEqual([])
    const silent = loopAround('work', 'work')
    silent.nodes[1]!.data = { code: 'console.log(1)' }
    expect(generatedNameProblems(silent)).toEqual([])
  })
})

describe('generatedNameProblems: inline steps', () => {
  it('finds a top-level declaration of a generated name', () => {
    expect(generatedNameProblems(inline('const step = 1'))).toEqual([
      {
        path: 'nodes.i.data.code',
        nodeId: 'i',
        message: 'Inline step "Prepare" declares `step`, which generated code uses. Rename it.',
      },
    ])
  })

  it('ignores the name in a comment, a string, or a nested scope', () => {
    for (const code of [
      '// const step = 1',
      'const s = "const step = 1"',
      'function f() { const step = 1 }',
      'if (true) { let flow = 2 }',
      'for (const step of [1]) {}',
    ]) {
      expect(generatedNameProblems(inline(code)), code).toEqual([])
    }
  })

  it('finds destructured, comma-separated, function and class declarations', () => {
    const names = (code: string) => generatedNameProblems(inline(code)).map((p) => p.message)
    expect(names('const { a, b: stepArgs } = x')).toHaveLength(1)
    expect(names('const [flow] = x')).toHaveLength(1)
    expect(names('let a = 1, env = 2')).toHaveLength(1)
    expect(names('function durableStep() {}')).toHaveLength(1)
    expect(names('class createInlineHost {}')).toHaveLength(1)
    expect(names('const { key: renamed } = { key: step }')).toEqual([])
  })

  it('accepts names generated code binds elsewhere but not beside inline code', () => {
    for (const name of ['inputs', 'ctx', 'err', '_output', 'runGraph', 'workflow', 'Env']) {
      expect(generatedNameProblems(inline(`const ${name} = 1`)), name).toEqual([])
    }
  })

  it('reads type arguments, defaults and function expressions as no declaration', () => {
    for (const code of [
      'const m = new Map<string, step>()',
      'const m: Record<string, flow> = {}',
      'const { a = defaults.env } = x',
      'const { a = foo(step) } = x',
      'const fn = function step() {}',
      'const C = class flow {}',
      'obj.class\nlet x = 1',
      'const handler = async () => { const step = 1 }',
    ]) {
      expect(generatedNameProblems(inline(code)), code).toEqual([])
    }
  })

  it('refuses platform, which a function calling another artifact binds', () => {
    expect(generatedNameProblems(inline('const platform = {}'))).toHaveLength(1)
  })

  it('finds an import binding a generated name, but not a runtime import under its own name', () => {
    expect(generatedNameProblems(inline('import step from "x"'))[0]?.message).toBe(
      'Inline step "Prepare" imports `step` from "x", which generated code uses. Rename it with `as`.',
    )
    expect(
      generatedNameProblems(inline('import { durableStep } from "#awaitstep/runtime"')),
    ).toEqual([])
    // Another generated module doesn't merge with the runtime import.
    expect(
      generatedNameProblems(inline('import { durableStep } from "#awaitstep/env"')),
    ).toHaveLength(1)
  })

  it('leaves step modules alone', () => {
    const ir = inline('x')
    ir.nodes[0]!.data = { code: 'export default async function Prepare() { const step = 1 }' }
    expect(generatedNameProblems(ir)).toEqual([])
  })
})

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
