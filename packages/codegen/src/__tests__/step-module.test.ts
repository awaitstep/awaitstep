import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import {
  MAX_STEP_CODE_LENGTH,
  followStepFunctionNames,
  isStepModule,
  normalizeStepModule,
  normalizeStepModules,
  renameStepFunction,
  stepBodyFromModule,
  stepFunctionName,
  stepModuleProblem,
  stepModuleProblems,
  stepModuleTemplate,
  stepReturnsValue,
} from '../step-module.js'

const MODULE = `export default async function fetch_user({ env, event, inputs, step, ctx }) {
  return { id: 1 };
}
`

function node(
  id: string,
  name: string,
  data: Record<string, unknown>,
  type = 'step',
): WorkflowNode {
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

describe('isStepModule / stepFunctionName', () => {
  it('tells a module from a body, ignoring comments', () => {
    expect(isStepModule(MODULE)).toBe(true)
    expect(isStepModule('return 1;')).toBe(false)
    expect(isStepModule('// export default is a phrase\nreturn 1;')).toBe(false)
    expect(stepFunctionName(MODULE)).toBe('fetch_user')
    expect(stepFunctionName('export default async function ({ env }) {}')).toBeNull()
    expect(stepFunctionName('export default async ({ env }) => 1')).toBeNull()
    expect(stepFunctionName('return 1;')).toBeNull()
  })
})

describe('stepModuleTemplate', () => {
  it('opens a new step with the documented body inside the signature', () => {
    expect(stepModuleTemplate('New_step')).toBe(
      'export default async function New_step({ env, event, inputs, step, ctx }) {\n  // Write your business logic here\n\n  return { result: "ok" };\n}\n',
    )
  })
})

describe('normalizeStepModule', () => {
  it('wraps a body into the module, hoisting imports and reading bare upstream names from inputs', () => {
    const body =
      "import { z } from 'zod'\nconst parsed = z.string().parse(fetch_user.id);\nreturn { parsed, at: event.timestamp };"
    expect(normalizeStepModule(body, 'check', ['fetch_user', 'other'])).toBe(
      "import { z } from 'zod'\n\nexport default async function check({ env, event, inputs, step, ctx }) {\n  const { fetch_user } = inputs;\n  const parsed = z.string().parse(fetch_user.id);\n  return { parsed, at: event.timestamp };\n}\n",
    )
  })

  it('does not read a name the body declares itself, and leaves a module alone', () => {
    expect(normalizeStepModule('const other = 1; return other;', 'x', ['other'])).not.toContain(
      'inputs;',
    )
    expect(normalizeStepModule(MODULE, 'anything', ['fetch_user'])).toBe(MODULE)
  })

  it('reads the container’s bindings a body used by their old bare names, the binding winning over a step of that name', () => {
    // A forEach body read `item` and `_loop_i`; a catch arm read `err`.
    expect(
      normalizeStepModule('return item.price * _loop_i;', 'price', ['item', 'other'], {
        item: 'item',
        index: '_loop_i',
      }),
    ).toContain('const { item, index: _loop_i } = inputs;')
    expect(
      normalizeStepModule('return { why: err.message };', 'why', [], { error: 'err' }),
    ).toContain('const { error: err } = inputs;')
    expect(normalizeStepModule('return 1;', 'x', [], { error: 'err' })).not.toContain('inputs;')
  })

  it('nests a body that declares one of the module’s own parameter names', () => {
    const out = normalizeStepModule('const ctx = 1;\nreturn ctx + fetch_user.id;', 'x', [
      'fetch_user',
    ])
    expect(out).toBe(
      'export default async function x({ env, event, inputs, step, ctx }) {\n  const { fetch_user } = inputs;\n  return await (async () => {\n    const ctx = 1;\n    return ctx + fetch_user.id;\n  })();\n}\n',
    )
    expect(normalizeStepModule('return ctx.attempt;', 'x', [])).not.toContain('async () =>')
  })
})

describe('stepReturnsValue', () => {
  it('counts a return in code, not one in a comment', () => {
    expect(stepReturnsValue('return 1;')).toBe(true)
    expect(stepReturnsValue('// return something later\nconsole.log(1);')).toBe(false)
    expect(stepReturnsValue('/* return */ console.log(1);')).toBe(false)
    expect(stepReturnsValue(MODULE)).toBe(true)
  })
})

describe('stepBodyFromModule', () => {
  it('turns the module the normaliser wrote back into inline statements', () => {
    const module = normalizeStepModule(
      "import { z } from 'zod'\nconst ctx = 1;\nreturn z.parse(fetch_user.id) + err.message;",
      'x',
      ['fetch_user'],
      { error: 'err' },
    )
    expect(stepBodyFromModule(module, { error: 'err' })).toBe(
      "import { z } from 'zod'\n\nconst ctx = 1;\nreturn z.parse(fetch_user.id) + err.message;\n",
    )
    expect(
      stepBodyFromModule(
        'export default async function x({ env, event, inputs, step, ctx }) {\n  return inputs.item.price + inputs.error.message;\n}\n',
        { item: 'item', error: 'err' },
      ),
    ).toBe('return item.price + err.message;\n')
  })

  it('leaves a module in any other shape alone', () => {
    const other = 'export default async function x({ env }) {\n  return 1;\n}\n'
    expect(stepBodyFromModule(other)).toBe(other)
    expect(stepBodyFromModule('return 1;')).toBe('return 1;')
  })
})

describe('normalizeStepModules', () => {
  it('normalises every non-inline step with the other nodes’ names, and returns the same object when nothing changes', () => {
    const ir = {
      nodes: [
        node('a', 'fetch user', { code: 'return { id: 1 };' }),
        node('b', 'check', { code: 'return fetch_user.id;' }),
        node('c', 'raw', { code: 'return fetch_user;', inline: true }),
        node('d', 'Nap', { duration: '1 second' }, 'sleep'),
      ],
    }
    const out = normalizeStepModules(ir)
    expect(out.nodes[0]!.data.code).toContain('export default async function fetch_user(')
    expect(out.nodes[1]!.data.code).toContain('const { fetch_user } = inputs;')
    expect(out.nodes[2]!.data.code).toBe('return fetch_user;')
    expect(out.nodes[3]).toBe(ir.nodes[3])
    expect(normalizeStepModules(out)).toBe(out)
  })

  it('gives an old loop-body or catch-arm body its container’s bindings as inputs', () => {
    const ir = {
      kind: 'workflow',
      entryNodeId: 'loop',
      nodes: [
        node('loop', 'Each', { loopType: 'forEach', itemVar: 'item', collection: 'rows' }, 'loop'),
        node('body', 'price', { code: 'return item.price * 2;' }),
        node('tc', 'Guard', {}, 'try_catch'),
        node('risky', 'risky', { code: 'return 1;' }),
        node('fallback', 'fallback', { code: 'return { why: err.message };' }),
      ],
      edges: [
        { id: 'e1', source: 'loop', target: 'body', label: 'body' },
        { id: 'e2', source: 'loop', target: 'tc', label: 'then' },
        { id: 'e3', source: 'tc', target: 'risky', label: 'try' },
        { id: 'e4', source: 'tc', target: 'fallback', label: 'catch' },
      ],
    }
    const out = normalizeStepModules(ir)
    expect(out.nodes[1]!.data.code).toContain('const { item } = inputs;')
    expect(out.nodes[4]!.data.code).toContain('const { error: err } = inputs;')
  })
})

describe('followStepFunctionNames', () => {
  const step = (id: string, name: string, fn: string) =>
    node(id, name, {
      code: `export default async function ${fn}({ env, event, inputs, step, ctx }) {}`,
    })

  it('renames the functions of steps whose variable names moved, and a new step’s to its own', () => {
    const previous = [step('a', 'x', 'x'), step('b', 'x', 'x_2')]
    // `a` removed: `b` is now `x`. A clone `c` of `b` arrives exporting `x_2`.
    const next = followStepFunctionNames(previous, [step('b', 'x', 'x_2'), step('c', 'x', 'x_2')])
    expect(stepFunctionName(String(next[0]!.data.code))).toBe('x')
    expect(stepFunctionName(String(next[1]!.data.code))).toBe('x_2')
  })

  it('leaves a step’s own mismatch alone and returns the same array when nothing changes', () => {
    const previous = [step('a', 'x', 'other')]
    const same = [step('a', 'x', 'other'), node('s', 'Nap', { duration: '1s' }, 'sleep')]
    expect(followStepFunctionNames(previous, same)).toBe(same)
  })
})

describe('renameStepFunction', () => {
  it('renames the default function only while it still carries the old name', () => {
    expect(renameStepFunction(MODULE, 'fetch_user', 'load_user')).toContain('function load_user(')
    expect(renameStepFunction(MODULE, 'other', 'load_user')).toBe(MODULE)
    expect(renameStepFunction('export default function* fetch_user() {}', 'fetch_user', 'g')).toBe(
      'export default function* g() {}',
    )
  })
})

describe('stepModuleProblems', () => {
  it('names the function the step must export, in the step’s own words', () => {
    const ir = {
      nodes: [
        node('a', 'sample step', { code: MODULE }),
        node('b', 'ok', { code: 'export default async function ok({ env }) { return 1; }' }),
        node('c', 'anon', { code: 'export default async () => 1' }),
        node('d', 'raw', { code: MODULE, inline: true }),
      ],
    }
    expect(stepModuleProblems(ir)).toEqual([
      {
        path: 'nodes.a.data.code',
        nodeId: 'a',
        message:
          'The function must be named `sample_step`, the step’s name as code reads it (it is `fetch_user`).',
      },
      {
        path: 'nodes.c.data.code',
        nodeId: 'c',
        message: 'The function must be named `anon`, the step’s name as code reads it.',
      },
      {
        path: 'nodes.d.data.code',
        nodeId: 'd',
        message: 'Inline steps hold statements, not a module.',
      },
    ])
  })

  it('expects the deduplicated and reserved-suffixed name, as the worker imports it', () => {
    const ir = {
      nodes: [
        node('a', 'step', { code: 'export default async function step_node() {}' }),
        node('b', 'x', { code: 'export default async function x() {}' }),
        node('c', 'x', { code: 'export default async function x_2() {}' }),
      ],
    }
    expect(stepModuleProblems(ir)).toEqual([])
  })
})

describe('reading a module without parsing it (security review round 1)', () => {
  it('does not take an `export default` or a `return` inside a string or a comment for one', () => {
    expect(isStepModule('const s = "export default async function x(";\nreturn s;')).toBe(false)
    expect(isStepModule('// export default\nreturn 1;')).toBe(false)
    expect(stepFunctionName('const s = "export default function y(";\n' + MODULE)).toBe(
      'fetch_user',
    )
    expect(stepReturnsValue('const s = "return";')).toBe(false)
  })

  it('renames the function in the code, not a commented-out header before it', () => {
    const code = '// export default async function fetch_user() {}\n' + MODULE
    const renamed = renameStepFunction(code, 'fetch_user', 'load_user')
    expect(renamed).toContain('// export default async function fetch_user() {}')
    expect(renamed).toContain('export default async function load_user(')
  })

  it('answers quickly for a header followed by a very long run of whitespace', () => {
    const code = 'export default function' + ' '.repeat(200_000) + '!'
    const started = Date.now()
    expect(stepFunctionName(code)).toBeNull()
    expect(isStepModule(code)).toBe(true)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('reads a container binding or an upstream name as a word, never as a pattern', () => {
    // An item name shaped like a regular expression used to be compiled as one.
    const out = normalizeStepModule('return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";', 'x', ['a+'], {
      '(?:a+)+!': '(?:a+)+!',
    })
    expect(out).not.toContain('inputs;')
  })

  it('refuses code longer than the cap, before anything else', () => {
    const long = { type: 'step', data: { code: 'return 1;' + ' '.repeat(MAX_STEP_CODE_LENGTH) } }
    expect(stepModuleProblem(long, 'x')).toBe('Step code is longer than 250,000 characters.')
    expect(stepModuleProblem({ type: 'step', data: { code: MODULE } }, 'fetch_user')).toBeNull()
  })

  it('returns the same document object when every step is a module already, without reading the graph', () => {
    const ir = {
      nodes: [node('a', 'a', { code: MODULE.replace('fetch_user', 'a') })],
      edges: [{ id: 'cycle', source: 'a', target: 'a' }],
      entryNodeId: 'a',
    }
    expect(normalizeStepModules(ir)).toBe(ir)
  })
})

describe('stepBodyFromModule leaves alone what it cannot unwrap faithfully', () => {
  it('a helper declared beside the function, or a destructure that renames or defaults', () => {
    const withHelper =
      'export default async function x({ env, event, inputs, step, ctx }) {\n  return helper();\n}\nfunction helper() { return 1; }\n'
    expect(stepBodyFromModule(withHelper)).toBe(withHelper)
    const renames =
      'export default async function x({ env, event, inputs, step, ctx }) {\n  const { a: b } = inputs;\n  return b;\n}\n'
    expect(stepBodyFromModule(renames)).toBe(renames)
    const defaults =
      'export default async function x({ env, event, inputs, step, ctx }) {\n  const { a = 1 } = inputs;\n  return a;\n}\n'
    expect(stepBodyFromModule(defaults)).toBe(defaults)
  })
})
