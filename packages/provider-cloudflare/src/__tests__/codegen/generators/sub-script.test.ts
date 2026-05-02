import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import {
  generateSubScript,
  getSubScriptBindings,
  workerNameToBinding,
} from '../../../codegen/generators/sub-script.js'

const V = '1.0.0'
const P = 'cloudflare'

function makeNode(overrides: Partial<WorkflowNode['data']> = {}): WorkflowNode {
  return {
    id: 'sub1',
    type: 'sub_script',
    name: 'Call email service',
    position: { x: 0, y: 0 },
    version: V,
    provider: P,
    data: { workerName: 'awaitstep-email-service', ...overrides },
  }
}

describe('workerNameToBinding', () => {
  it('strips awaitstep- prefix and uppercases hyphenated names', () => {
    expect(workerNameToBinding('awaitstep-email-service')).toBe('EMAIL_SERVICE')
    expect(workerNameToBinding('awaitstep-my-script')).toBe('MY_SCRIPT')
  })

  it('passes non-prefixed names through (uppercased, hyphens to underscores)', () => {
    expect(workerNameToBinding('my-worker')).toBe('MY_WORKER')
    expect(workerNameToBinding('plain')).toBe('PLAIN')
  })

  it('case-insensitive prefix match', () => {
    expect(workerNameToBinding('AwaitStep-Foo')).toBe('FOO')
  })

  it('replaces non-identifier characters with underscores', () => {
    expect(workerNameToBinding('awaitstep-foo.bar/baz')).toBe('FOO_BAR_BAZ')
  })

  it('returns empty string for empty input', () => {
    expect(workerNameToBinding('')).toBe('')
  })
})

describe('generateSubScript', () => {
  it('emits a service-binding fetch call wrapped in step.do (workflow mode)', () => {
    const code = generateSubScript(makeNode(), 'workflow')
    expect(code).toContain('step.do("Call email service"')
    expect(code).toContain('await env.EMAIL_SERVICE.fetch("https://invoke/"')
    expect(code).toContain('method: "POST"')
    expect(code).toContain('return response.json()')
  })

  it('emits a bare await fetch (script mode)', () => {
    const code = generateSubScript(makeNode(), 'script')
    expect(code).not.toContain('step.do')
    expect(code).toContain(
      'const sub1 = await env.EMAIL_SERVICE.fetch("https://invoke/", { method: "POST" }).then(r => r.json())',
    )
  })

  it('uses POST as the default method', () => {
    const code = generateSubScript(makeNode())
    expect(code).toContain('method: "POST"')
  })

  it('respects an explicit method override', () => {
    const code = generateSubScript(makeNode({ method: 'PUT' }))
    expect(code).toContain('method: "PUT"')
  })

  it('uses the configured URL', () => {
    const code = generateSubScript(makeNode({ url: 'https://target/path' }))
    expect(code).toContain('"https://target/path"')
  })

  it('serializes JS-expression body via JSON.stringify (with string-typecheck escape)', () => {
    const code = generateSubScript(makeNode({ body: '{ id: 42, items: state.items }' }), 'script')
    // Body wrapper handles both string and non-string values.
    expect(code).toContain(
      'body: typeof ({ id: 42, items: state.items }) === "string" ? ({ id: 42, items: state.items }) : JSON.stringify({ id: 42, items: state.items })',
    )
  })

  it('emits headers when provided', () => {
    const code = generateSubScript(
      makeNode({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' } }),
    )
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('"Authorization": "Bearer x"')
  })
})

describe('getSubScriptBindings', () => {
  it('collects one binding per unique workerName', () => {
    const bindings = getSubScriptBindings([
      { type: 'sub_script', data: { workerName: 'awaitstep-emails' } },
      { type: 'sub_script', data: { workerName: 'awaitstep-jobs' } },
      { type: 'step', data: { code: 'noop' } },
    ])
    expect(bindings).toEqual([
      { binding: 'EMAILS', service: 'awaitstep-emails' },
      { binding: 'JOBS', service: 'awaitstep-jobs' },
    ])
  })

  it('dedupes when multiple sub_script nodes target the same worker', () => {
    const bindings = getSubScriptBindings([
      { type: 'sub_script', data: { workerName: 'awaitstep-emails' } },
      { type: 'sub_script', data: { workerName: 'awaitstep-emails' } },
    ])
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toEqual({ binding: 'EMAILS', service: 'awaitstep-emails' })
  })

  it('skips nodes with empty workerName', () => {
    const bindings = getSubScriptBindings([
      { type: 'sub_script', data: { workerName: '' } },
      { type: 'sub_script', data: {} },
    ])
    expect(bindings).toEqual([])
  })
})
