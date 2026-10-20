import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GeneratedBundle, LocalDevOptions } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import { buildDevWorkspaceFiles, formatDevVars, writeDevWorkspace } from '../dev-workspace.js'

const entrySource = `
import { WorkflowEntrypoint } from 'cloudflare:workers'
export class GeneratedFlow extends WorkflowEntrypoint<Env, Params> {
  async run(event: unknown, step: unknown): Promise<void> {}
}
`

const bundle: GeneratedBundle = {
  entry: 'worker.ts',
  files: [
    { path: 'worker.ts', source: entrySource, role: 'entry' },
    { path: 'nodes/step.ts', source: 'export const x: number = 1', role: 'module' },
  ],
}

function options(overrides: Partial<LocalDevOptions> = {}): LocalDevOptions {
  return { workflowId: 'wf-1', workflowName: 'My Flow', ...overrides }
}

function irWith(nodes: WorkflowIR['nodes']): WorkflowIR {
  return {
    metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: nodes[0]?.id ?? 'n1',
    nodes,
    edges: [],
  } as WorkflowIR
}

function node(id: string, type: string, data: Record<string, unknown>) {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  } as WorkflowIR['nodes'][number]
}

async function fileNamed(files: { path: string; content: string }[], path: string) {
  const found = files.find((file) => file.path === path)
  expect(found, `${path} missing from workspace`).toBeDefined()
  return found!.content
}

describe('buildDevWorkspaceFiles', () => {
  it('compiles the bundle so the import map has something to resolve to', async () => {
    const files = await buildDevWorkspaceFiles(bundle, options())
    const paths = files.map((file) => file.path)

    // Uncompiled, `#app/worker` resolves to nothing and every workflow with
    // handler modules fails to start.
    expect(paths).toContain('worker.js')
    expect(paths).toContain('nodes/step.js')
    expect(paths).not.toContain('worker.ts')
    expect(await fileNamed(files, 'nodes/step.js')).not.toContain(': number')
  })

  it('points wrangler at the compiled entry', async () => {
    const files = await buildDevWorkspaceFiles(bundle, options())
    const config = JSON.parse(await fileNamed(files, 'wrangler.json'))
    expect(config.main).toBe('./worker.js')
  })

  it('names the class the generated code exports, not the workflow', async () => {
    // Deploy reads the class out of the entry; guessing it from the workflow
    // name gives a different class and the binding fails to resolve.
    const files = await buildDevWorkspaceFiles(bundle, options())
    const config = JSON.parse(await fileNamed(files, 'wrangler.json'))
    expect(config.workflows[0].class_name).toBe('GeneratedFlow')
  })

  it('includes the bindings a deploy would include', async () => {
    const ir = irWith([
      node('call', 'sub_script', { workerName: 'awaitstep-other' }),
      node('sub', 'sub_workflow', { workflowId: 'wf-2', workflowName: 'Other' }),
    ])
    const files = await buildDevWorkspaceFiles(bundle, options({ ir }))
    const config = JSON.parse(await fileNamed(files, 'wrangler.json'))

    // Without these, a Call Script or sub-workflow step throws in a test
    // session while working perfectly once deployed.
    expect(config.services?.map((s: { binding: string }) => s.binding)).toContain('OTHER')
    expect(config.workflows?.length).toBeGreaterThan(1)
  })

  it('writes a .dev.vars only when there are secrets', async () => {
    const withSecrets = await buildDevWorkspaceFiles(bundle, options({ secrets: { A: '1' } }))
    expect(withSecrets.find((file) => file.path === '.dev.vars')?.secret).toBe(true)

    const without = await buildDevWorkspaceFiles(bundle, options())
    expect(without.find((file) => file.path === '.dev.vars')).toBeUndefined()
  })
})

describe('formatDevVars', () => {
  it('quotes values so a comment character cannot truncate them', () => {
    expect(formatDevVars({ TOKEN: 'abc#def' })).toBe('TOKEN="abc#def"')
  })

  it('keeps a multi-line key whole', () => {
    // Unquoted, a PEM key is cut at its first newline and the rest of it is
    // parsed as further variable declarations.
    const pem = '-----BEGIN KEY-----\nabc\n-----END KEY-----'
    expect(formatDevVars({ KEY: pem })).toBe('KEY="-----BEGIN KEY-----\\nabc\\n-----END KEY-----"')
  })

  it('escapes quotes and backslashes rather than ending the value early', () => {
    expect(formatDevVars({ A: 'say "hi"' })).toBe('A="say \\"hi\\""')
    expect(formatDevVars({ A: 'back\\slash' })).toBe('A="back\\\\slash"')
  })

  it('drops keys that are not valid identifiers', () => {
    // A key wrangler cannot parse is worse than an absent one: it shifts
    // everything after it.
    expect(formatDevVars({ 'not a key': 'x', GOOD: 'y' })).toBe('GOOD="y"')
  })

  it('returns nothing for no secrets', () => {
    expect(formatDevVars(undefined)).toBe('')
    expect(formatDevVars({})).toBe('')
  })
})

describe('writeDevWorkspace', () => {
  it('creates nested directories and restricts the secrets file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awaitstep-workspace-'))
    try {
      await writeDevWorkspace(dir, [
        { path: 'nodes/step.js', content: 'export const x = 1' },
        { path: '.dev.vars', content: 'A="1"', secret: true },
      ])

      expect(await readFile(join(dir, 'nodes/step.js'), 'utf-8')).toBe('export const x = 1')
      const mode = (await stat(join(dir, '.dev.vars'))).mode & 0o777
      // Secrets land in a world-readable /tmp otherwise.
      expect(mode).toBe(0o600)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
