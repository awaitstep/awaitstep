import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CODE_FIELDS,
  codeFieldsOf,
  nodeExpressionProblems,
  valueExpressionProblems,
  type ExpressionScope,
} from '../expressions/problems.js'

const scope: ExpressionScope = {
  nodeId: 'me',
  upstream: new Set(['fetch']),
  allNodeIds: new Set(['fetch', 'me', 'later']),
  idByName: new Map([['fetch_user', 'fetch']]),
}

function messages(value: string, code = false) {
  return valueExpressionProblems(value, scope, { code }).map((problem) => problem.message)
}

describe('valueExpressionProblems', () => {
  it('accepts valid refs to earlier steps, by id or variable name, and event, env, trigger', () => {
    expect(messages('Hi {{fetch.name}} {{fetch_user.email}}')).toEqual([])
    expect(messages('{{event.payload.id}} {{env.API_KEY}} {{trigger.x}}')).toEqual([])
    expect(messages('no braces at all')).toEqual([])
  })

  it('flags an empty or broken expression', () => {
    expect(messages('{{}}')).toEqual([
      '“{{}}” isn’t a valid expression. Use {{step.field}}, {{event.payload.field}} or {{env.NAME}}.',
    ])
    expect(messages('{{fetch.}}')).toHaveLength(1)
  })

  it('leaves `{{ ` with a space as text: a template for something downstream', () => {
    expect(messages('Hi {{ name }}, see {{ #each items }}')).toEqual([])
    expect(messages('{{{fetch.x}}}')).toEqual([])
    expect(messages('{{{ html }}}')).toEqual([])
  })

  it('reads a run of braces ending in a valid expression as that expression', () => {
    expect(messages('{{{{fetch.b}}}}')).toEqual([])
    expect(messages('{{{{fetch.b}}')).toEqual([])
  })

  it('reports one problem per run of braces', () => {
    expect(messages('{{{{{{{ {{fetch.b}}x')).toEqual([])
    expect(messages('{{{x {{fetch.a}}')).toEqual(['“{{{x” is never closed with }}.'])
  })

  it('says where each problem starts, so an editor marks the right text', () => {
    const value = '{{fetch.name}} and {{fetch.name'
    expect(valueExpressionProblems(value, scope).map((problem) => problem.start)).toEqual([19])
    const twice = '{{nope.x}} {{nope.x'
    expect(
      valueExpressionProblems(twice, scope)
        .map((problem) => problem.start)
        .sort(),
    ).toEqual([0, 11])
  })

  it('flags a `{{` never closed even when a valid expression follows it', () => {
    expect(messages('Hello {{fetch.name and {{fetch.email}}')).toEqual([
      '“{{fetch.name and” is never closed with }}.',
    ])
  })

  it('says an expression is too long rather than invalid', () => {
    const long = `{{fetch.${'a'.repeat(300)}}}`
    expect(messages(long)[0]).toMatch(/is too long for an expression \(256 characters at most\)\.$/)
  })

  it('flags one never closed', () => {
    expect(messages('Hello {{fetch.name')).toEqual(['“{{fetch.name” is never closed with }}.'])
  })

  it('flags a step that is missing, later, or this node', () => {
    expect(messages('{{nope.x}}')).toEqual(['There’s no step called “nope” in this workflow.'])
    expect(messages('{{later.x}}')).toEqual([
      '“later” runs after this node. Use a step that runs before it.',
    ])
    expect(messages('{{me.x}}')).toEqual([
      '“me” is this node itself. Use a step that runs before it.',
    ])
  })

  it('reads a code field’s braces as code: only valid expressions are checked', () => {
    expect(messages('return {{}}', true)).toEqual([])
    expect(messages('const a = {{nope.x}}', true)).toEqual([
      'There’s no step called “nope” in this workflow.',
    ])
  })
})

describe('nodeExpressionProblems', () => {
  it('names the field, including strings one level inside an array', () => {
    const problems = nodeExpressionProblems(
      {
        name: '{{}}',
        branches: [{ label: 'yes', condition: '{{later.ok}}' }],
        code: 'return {{}}',
        headers: { auth: '{{}}' },
        count: 3,
      },
      scope,
    )
    expect(problems.map((problem) => problem.field)).toEqual(['name', 'branches'])
  })
})

describe('BUILTIN_CODE_FIELDS', () => {
  it('matches the code and JSON fields of the built-in definitions', async () => {
    const { readFileSync } = await import('node:fs')
    const registry = JSON.parse(
      readFileSync(new URL('../../../../nodes/registry.json', import.meta.url), 'utf8'),
    ) as { definitions: { id: string; configSchema: Record<string, { type: string }> }[] }
    const fromRegistry = Object.fromEntries(
      registry.definitions
        .map((definition) => [definition.id, [...codeFieldsOf(definition.configSchema)]] as const)
        .filter(([, fields]) => fields.length > 0),
    )
    expect(fromRegistry).toEqual(BUILTIN_CODE_FIELDS)
  })

  it('treats a built-in’s code fields as code without its schema', () => {
    const problems = nodeExpressionProblems(
      { body: 'JSON.stringify({ html: "<p>Hi {{ }}</p>" })', url: '{{}}' },
      scope,
      codeFieldsOf(undefined, 'http_request'),
    )
    expect(problems.map((problem) => problem.field)).toEqual(['url'])
  })
})

describe('hostile values', () => {
  it('scans a value close to the request limit quickly, reporting a capped few', () => {
    const value = '{{a}}{{}}'.repeat(110_000)
    const started = performance.now()
    const problems = valueExpressionProblems(value, scope)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(problems.length).toBeLessThanOrEqual(20)
  })

  it('does not throw on a value full of unclosed braces', () => {
    const value = '{{x'.repeat(150_000)
    expect(() => valueExpressionProblems(value, scope)).not.toThrow()
    const problems = valueExpressionProblems(value, scope)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.expression.length).toBeLessThanOrEqual(258)
  })

  it('caps a node with many bad fields', () => {
    const data = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, '{{}}']))
    expect(nodeExpressionProblems(data, scope)).toHaveLength(50)
  })
})

describe('valueExpressionProblems on long runs of braces', () => {
  it('reads a long run of braces in front of a valid expression in linear time', () => {
    const value = '{'.repeat(400_000) + 'fetch_user.id}}'
    const started = performance.now()
    const problems = valueExpressionProblems(value, scope, { code: false })
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(problems.length).toBeLessThanOrEqual(20)
  })
})
