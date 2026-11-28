import { describe, expect, it } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generatedNameProblems } from '../generated-name-problems.js'

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
    expect(names('function waitForEventOrTimeout() {}')).toHaveLength(1)
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
    expect(generatedNameProblems(inline('import { stepArgs } from "#awaitstep/runtime"'))).toEqual(
      [],
    )
    // Another generated module doesn't merge with the runtime import.
    expect(generatedNameProblems(inline('import { stepArgs } from "#awaitstep/env"'))).toHaveLength(
      1,
    )
  })

  it('leaves step modules alone', () => {
    const ir = inline('x')
    ir.nodes[0]!.data = { code: 'export default async function Prepare() { const step = 1 }' }
    expect(generatedNameProblems(ir)).toEqual([])
  })
})

describe('generatedNameProblems: inline names binding twice', () => {
  const chain = (...nodes: WorkflowIR['nodes']): WorkflowIR => ({
    metadata: META,
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })),
    entryNodeId: nodes[0]!.id,
  })

  it('finds an inline name that is another step’s variable, on the inline step', () => {
    const ir = chain(
      node('i', 'step', 'Prepare', { code: 'const Sync_Contact = 1', inline: true }),
      node('s', 'step', 'Sync Contact', { code: 'return 1' }),
    )
    expect(generatedNameProblems(ir)).toEqual([
      {
        path: 'nodes.i.data.code',
        nodeId: 'i',
        message:
          'Inline step "Prepare" declares `Sync_Contact`, which step "Sync Contact" also binds. Rename one.',
      },
    ])
  })

  it('finds two inline siblings declaring the same name', () => {
    const ir = chain(
      node('a', 'step', 'First', { code: 'const user = 1', inline: true }),
      node('b', 'step', 'Second', { code: 'let user = 2', inline: true }),
    )
    expect(generatedNameProblems(ir).map((p) => p.nodeId)).toEqual(['b'])
  })

  it('allows the same name in two arms of a branch', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('gate', 'branch', 'Gate', {
          branches: [
            { label: 'yes', condition: 'true' },
            { label: 'no', condition: '' },
          ],
        }),
        node('a', 'step', 'First', { code: 'const user = 1', inline: true }),
        node('b', 'step', 'Second', { code: 'const user = 2', inline: true }),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'a', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'b', label: 'no' },
      ],
      entryNodeId: 'gate',
    }
    expect(generatedNameProblems(ir)).toEqual([])
  })

  it('ignores a step without a value, which binds nothing', () => {
    const ir = chain(
      node('i', 'step', 'Prepare', { code: 'const Sync_Contact = 1', inline: true }),
      node('s', 'step', 'Sync Contact', { code: 'console.log(1)' }),
    )
    expect(generatedNameProblems(ir)).toEqual([])
  })

  it('finds a loop item named like an inline name inside the loop', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('each', 'loop', 'each', { loopType: 'forEach', collection: '[1]', itemVar: 'user' }),
        node('i', 'step', 'Prepare', { code: 'const user = 1', inline: true }),
      ],
      edges: [{ id: 'e1', source: 'each', target: 'i', label: 'body' }],
      entryNodeId: 'each',
    }
    expect(generatedNameProblems(ir).map((p) => p.path)).toEqual(['nodes.each.data.itemVar'])
  })
})

describe('generatedNameProblems: inline names across blocks', () => {
  const branch = (id: string) =>
    node(id, 'branch', 'Gate', {
      branches: [
        { label: 'yes', condition: 'true' },
        { label: 'no', condition: '' },
      ],
    })

  it('finds an inline name that a function export nested in a branch hoists', () => {
    const ir = {
      metadata: META,
      kind: 'script',
      nodes: [
        node('i', 'step', 'Prepare', { code: 'const Fetch = 1', inline: true }),
        branch('gate'),
        node('f', 'step', 'Fetch', { code: 'return 2', export: true }),
      ],
      edges: [
        { id: 'e0', source: 'i', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'f', label: 'yes' },
      ],
      entryNodeId: 'i',
    }
    expect(generatedNameProblems(ir).map((p) => p.nodeId)).toEqual(['i'])
  })

  it('finds a merge that redeclares a name from any arm it joins, not only the first', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        branch('gate'),
        node('a', 'step', 'Yes', { code: 'console.log(1)', inline: true }),
        node('b', 'step', 'No', { code: 'const user = 1', inline: true }),
        node('m', 'step', 'Merge', { code: 'const user = 2', inline: true }),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'a', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'b', label: 'no' },
        { id: 'e3', source: 'a', target: 'm' },
        { id: 'e4', source: 'b', target: 'm' },
      ],
      entryNodeId: 'gate',
    }
    expect(generatedNameProblems(ir).map((p) => p.nodeId)).toEqual(['m'])
  })

  it('finds an inline step shadowing an outer value that an earlier sibling reads', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('u', 'step', 'user', { code: 'return 1' }),
        branch('gate'),
        node('r', 'step', 'Reader', {
          code: 'export default async function Reader({ inputs }) {\n  return inputs.user\n}\n',
        }),
        node('i', 'step', 'Shadow', { code: 'const user = 2', inline: true }),
      ],
      edges: [
        { id: 'e0', source: 'u', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'r', label: 'yes' },
        { id: 'e2', source: 'r', target: 'i' },
      ],
      entryNodeId: 'u',
    }
    expect(generatedNameProblems(ir).map((p) => p.message)).toEqual([
      'Inline step "Shadow" declares `user`, which step "user" also binds. Rename one.',
    ])
  })

  it('does not throw on a cycle', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('a', 'step', 'A', { code: 'const user = 1', inline: true }),
        node('b', 'step', 'B', { code: 'return 1' }),
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    }
    expect(() => generatedNameProblems(ir)).not.toThrow()
  })
})

describe('generatedNameProblems: large graphs', () => {
  it('checks a 600-arm branch whose arms and merge share a name within seconds', () => {
    // The cubic check took about 22 s here (6.6 s at 400 arms); the walk takes
    // a fraction of one, with room left for a loaded test run.
    const arms = 600
    const nodes: WorkflowIR['nodes'] = [
      node('gate', 'branch', 'Gate', {
        branches: Array.from({ length: arms }, (_, i) => ({ label: `l${i}`, condition: 'true' })),
      }),
      node('m', 'step', 'Merge', { code: 'const user = 2', inline: true }),
    ]
    const edges: WorkflowIR['edges'] = []
    for (let i = 0; i < arms; i++) {
      nodes.push(node(`a${i}`, 'step', `A${i}`, { code: 'const user = 1', inline: true }))
      edges.push(
        { id: `e${i}`, source: 'gate', target: `a${i}`, label: `l${i}` },
        { id: `f${i}`, source: `a${i}`, target: 'm' },
      )
    }
    const started = performance.now()
    const problems = generatedNameProblems({ metadata: META, nodes, edges, entryNodeId: 'gate' })
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('checks a 2000-step fan-in of distinct names without any scope pass', () => {
    const nodes: WorkflowIR['nodes'] = [node('entry', 'step', 'Entry', { code: 'return 1' })]
    const edges: WorkflowIR['edges'] = []
    for (let i = 0; i < 2000; i++) {
      nodes.push(node(`a${i}`, 'step', `A${i}`, { code: `const v${i} = 1`, inline: true }))
      edges.push(
        { id: `e${i}`, source: 'entry', target: `a${i}` },
        { id: `f${i}`, source: `a${i}`, target: 'join' },
      )
    }
    nodes.push(node('join', 'step', 'Join', { code: 'const user = 1', inline: true }))
    const started = performance.now()
    expect(generatedNameProblems({ metadata: META, nodes, edges, entryNodeId: 'entry' })).toEqual(
      [],
    )
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
