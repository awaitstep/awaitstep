import { describe, expect, it } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import {
  UNIVERSAL_FUNCTION_PATH,
  generateUniversalFunctionBundle,
  generateUniversalWorkflow,
} from '../graph/universal.js'
import { normalizeStepModules } from '../step-module.js'

function node(
  id: string,
  name: string,
  data: Record<string, unknown>,
  type = 'step',
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

const META = { name: 'sample', version: 1, createdAt: '', updatedAt: '' }

const getCustomer = (code = 'const user = getFakeUser()') =>
  node('get', 'Get Customer', {
    inline: true,
    code: `import { getFakeUser } from '#modules/faker'\n\n${code}`,
  })

const syncContact = (body: string) =>
  node('sync', 'Sync Contact', {
    code: `export default async function Sync_Contact({ inputs }) {\n  ${body}\n}\n`,
  })

function chain(...nodes: WorkflowIR['nodes']): WorkflowIR {
  return {
    metadata: META,
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })),
    entryNodeId: nodes[0]!.id,
  }
}

function functionSource(ir: WorkflowIR): string {
  return generateUniversalFunctionBundle({ ...ir, kind: 'script' }).files.find(
    (file) => file.path === UNIVERSAL_FUNCTION_PATH,
  )!.source
}

const callInputs = (source: string, binding: string) =>
  source.match(new RegExp(`\\$${binding}\\(stepArgs\\(\\{ env, event, inputs: (\\{[^}]*\\})`))?.[1]

describe('inline step bindings', () => {
  it('passes an inline step’s top-level const to a function step that reads it', () => {
    const source = functionSource(chain(getCustomer(), syncContact('return inputs.user')))
    expect(source).toContain('const user = getFakeUser()')
    expect(callInputs(source, 'Sync_Contact')).toBe('{ user }')
  })

  it('passes it in a workflow too', () => {
    const source = generateUniversalWorkflow(
      chain(getCustomer(), syncContact('return inputs.user')),
    )
    expect(callInputs(source, 'Sync_Contact')).toBe('{ user }')
  })

  it('passes nothing to a step that does not read it', () => {
    const source = functionSource(chain(getCustomer(), syncContact('return 1')))
    expect(callInputs(source, 'Sync_Contact')).toBe('{}')
  })

  it('passes each destructured name on its own', () => {
    const source = functionSource(
      chain(
        getCustomer('const { id, email } = getFakeUser()'),
        syncContact('return [inputs.id, inputs.email]'),
      ),
    )
    expect(callInputs(source, 'Sync_Contact')).toBe('{ id, email }')
  })

  it('does not pass an import or a name declared inside a block', () => {
    const source = functionSource(
      chain(
        getCustomer('if (true) { const hidden = 1 }'),
        syncContact('return [inputs.getFakeUser, inputs.hidden]'),
      ),
    )
    expect(callInputs(source, 'Sync_Contact')).toBe('{}')
  })

  it('keeps the legacy `const <VarName>` form working', () => {
    const source = functionSource(
      chain(
        getCustomer('const Get_Customer = getFakeUser()'),
        syncContact('return inputs.Get_Customer'),
      ),
    )
    expect(callInputs(source, 'Sync_Contact')).toBe('{ Get_Customer }')
  })

  it('reads a bare name in a plain step body from the inline step', () => {
    const ir = chain(getCustomer(), node('sync', 'Sync Contact', { code: 'return user.email' }))
    const sync = normalizeStepModules(ir).nodes.find((n) => n.id === 'sync')!
    expect(String(sync.data.code)).toContain('const { user } = inputs;')
    expect(callInputs(functionSource(ir), 'Sync_Contact')).toBe('{ user }')
  })

  it('scopes an inline step inside a branch arm to that arm', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node(
          'gate',
          'Gate',
          {
            branches: [
              { label: 'yes', condition: 'true' },
              { label: 'no', condition: '' },
            ],
          },
          'branch',
        ),
        getCustomer(),
        syncContact('return inputs.user'),
        node('after', 'After', {
          code: 'export default async function After({ inputs }) {\n  return inputs.user\n}\n',
        }),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'get', label: 'yes' },
        { id: 'e2', source: 'get', target: 'sync' },
        { id: 'e3', source: 'gate', target: 'after', label: 'then' },
      ],
      entryNodeId: 'gate',
    }
    const source = functionSource(ir)
    expect(callInputs(source, 'Sync_Contact')).toBe('{ user }')
    expect(callInputs(source, 'After')).toBe('{}')
  })

  it('destructures a name once when a valueless step shares it with an inline step', () => {
    const ir = chain(
      node('u', 'user', { code: 'console.log(1)' }),
      getCustomer('const user = 1'),
      node('sync', 'Sync Contact', { code: 'return user + 1' }),
    )
    const sync = normalizeStepModules(ir).nodes.find((n) => n.id === 'sync')!
    expect(String(sync.data.code)).toContain('const { user } = inputs;')
  })

  it('destructures a shadowed name once', () => {
    const ir: WorkflowIR = {
      metadata: META,
      nodes: [
        node('outer', 'Outer', { inline: true, code: 'const user = 1' }),
        node(
          'gate',
          'Gate',
          {
            branches: [
              { label: 'yes', condition: 'true' },
              { label: 'no', condition: '' },
            ],
          },
          'branch',
        ),
        node('inner', 'Inner', { inline: true, code: 'const user = 2' }),
        node('sync', 'Sync Contact', { code: 'return user + 1' }),
      ],
      edges: [
        { id: 'e0', source: 'outer', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'inner', label: 'yes' },
        { id: 'e2', source: 'inner', target: 'sync' },
      ],
      entryNodeId: 'outer',
    }
    const sync = normalizeStepModules(ir).nodes.find((n) => n.id === 'sync')!
    expect(String(sync.data.code)).toContain('const { user } = inputs;')
  })
})
