import { describe, it, expect } from 'vitest'
import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { bundleCodeFiles, bundleDeployFiles, bundlePackageManifest } from '@awaitstep/codegen'
import { generateWorkflowBundle } from '../../codegen/generate.js'
import { CloudflareWorkflowsAdapter } from '../../adapter.js'

function node(id: string, name: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const files = [
  { path: 'config/retry.ts', source: 'export const retry = <T>(fn: () => T) => fn()' },
  { path: 'data/countries.json', source: '["NL"]' },
  { path: 'README.md', source: '# notes' },
  { path: 'tsconfig.json', source: '{}' },
  { path: 'package.json', source: '{"name":"my-worker","dependencies":{"zod":"^4.0.0"}}' },
]

const workflowIr: WorkflowIR = {
  metadata: { name: 'Files', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'fetch',
  nodes: [
    node('fetch', 'Fetch', {
      code: "import { retry } from '#app/config/retry'\nreturn retry(() => 1);",
    }),
  ],
  edges: [],
  runtime: { files },
}

describe('project files in generated bundles', () => {
  const bundle = generateWorkflowBundle(workflowIr)

  it('ships them after the generated files with roles by kind, imports untouched', () => {
    expect(bundle.files.map((f) => `${f.role}:${f.path}`)).toEqual([
      'entry:worker.ts',
      'module:awaitstep/workflow.ts',
      'module:awaitstep/env.ts',
      'module:nodes/Fetch.ts',
      'module:awaitstep/runtime.ts',
      'module:config/retry.ts',
      'asset:data/countries.json',
      'asset:README.md',
      'config:tsconfig.json',
      'meta:package.json',
    ])
    expect(bundle.files.find((f) => f.path === 'nodes/Fetch.ts')?.source).toContain(
      "from '#app/config/retry'",
    )
  })

  it('transpiles only code, deploys code and assets, and exposes the manifest', () => {
    expect(bundleCodeFiles(bundle).map((f) => f.path)).toEqual([
      'worker.ts',
      'awaitstep/workflow.ts',
      'awaitstep/env.ts',
      'nodes/Fetch.ts',
      'awaitstep/runtime.ts',
      'config/retry.ts',
    ])
    expect(bundleDeployFiles(bundle).map((f) => f.path)).toEqual([
      'worker.ts',
      'awaitstep/workflow.ts',
      'awaitstep/env.ts',
      'nodes/Fetch.ts',
      'awaitstep/runtime.ts',
      'config/retry.ts',
      'data/countries.json',
      'README.md',
    ])
    expect(bundlePackageManifest(bundle)).toBe(files[4].source)
  })

  it('includes them for scripts through the provider adapter', () => {
    const scriptIr: ScriptIR = {
      kind: 'script',
      metadata: { name: 'Fn', version: 1, createdAt: '', updatedAt: '' },
      trigger: { type: 'http' },
      entryNodeId: 'fetch',
      nodes: [node('fetch', 'Fetch', { code: 'return 1;' })],
      edges: [],
      runtime: { files: files.slice(0, 2) },
    }
    const scriptBundle = new CloudflareWorkflowsAdapter().generate(scriptIr)
    expect(scriptBundle.files.map((f) => `${f.role}:${f.path}`)).toEqual([
      'entry:worker.ts',
      'module:config/retry.ts',
      'asset:data/countries.json',
    ])
  })

  it('carries handlers.ts as a handlers input that is compiled into the entry, not deployed', () => {
    // The API folds handlers.ts into the triggerCode option before generating.
    const handlers = '@fetch function handler(request, env) { return new Response("file") }'
    const withHandlers = generateWorkflowBundle(
      { ...workflowIr, runtime: { files: [{ path: 'handlers.ts', source: handlers }] } },
      { triggerCode: handlers },
    )
    expect(withHandlers.files.map((f) => `${f.role}:${f.path}`)).toContain('handlers:handlers.ts')
    expect(bundleDeployFiles(withHandlers).map((f) => f.path)).not.toContain('handlers.ts')
    expect(bundleCodeFiles(withHandlers).map((f) => f.path)).not.toContain('handlers.ts')
    expect(withHandlers.files.find((f) => f.path === 'worker.ts')?.source).toContain(
      'new Response("file")',
    )
  })

  it('still refuses a nested package.json that slipped past IR validation', () => {
    expect(() =>
      generateWorkflowBundle({
        ...workflowIr,
        runtime: { files: [{ path: 'config/package.json', source: '{}' }] },
      }),
    ).toThrow(/Reserved toolchain filename/)
  })
})
