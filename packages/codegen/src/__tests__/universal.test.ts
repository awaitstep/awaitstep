import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import {
  generateUniversalFunctionBundle,
  generateUniversalWorkflow,
  generateUniversalWorkflowBundle,
  UNIVERSAL_ENV_PATH,
  UNIVERSAL_FUNCTION_PATH,
  UNIVERSAL_WORKFLOW_PATH,
} from '../graph/universal.js'

function ir(nodes: WorkflowIR['nodes'], extra: Partial<WorkflowIR> = {}): WorkflowIR {
  return {
    metadata: { name: 'sample workflow', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    entryNodeId: nodes[0]?.id,
    ...extra,
  }
}

function node(
  id: string,
  type: string,
  name: string,
  data: Record<string, unknown> = {},
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

describe('generateUniversalWorkflowBundle', () => {
  it('emits a portable workflow module with no provider bootstrap', () => {
    const bundle = generateUniversalWorkflowBundle(
      ir([node('s1', 'step', 'Fetch data', { code: 'return fetch("https://example.com")' })]),
    )

    expect(bundle.entry).toBe(UNIVERSAL_WORKFLOW_PATH)
    expect(bundle.primary).toBe(UNIVERSAL_WORKFLOW_PATH)
    expect(bundle.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([UNIVERSAL_WORKFLOW_PATH, UNIVERSAL_ENV_PATH, 'steps/s1.ts']),
    )
    expect(bundle.files.some((file) => file.path === 'worker.ts')).toBe(false)

    const source = bundle.files.find((file) => file.path === UNIVERSAL_WORKFLOW_PATH)!.source
    expect(source).toContain('defineWorkflow<Env>')
    expect(source).toContain('#awaitstep/runtime')
    expect(source).not.toMatch(/cloudflare/i)
    expect(source).not.toContain('WorkflowEntrypoint')
    expect(source).not.toContain('env.WORKFLOW')
  })

  it('imports the timeout helper only when the graph has a wait', () => {
    const withWait = generateUniversalWorkflow(
      ir([node('w1', 'wait_for_event', 'Wait for approval', { eventType: 'approval' })]),
    )
    expect(withWait).toContain('isWorkflowTimeoutError')
    expect(withWait).toContain('.catch((err) => {')
    expect(withWait).not.toContain('_timedOut')

    const withoutWait = generateUniversalWorkflow(
      ir([node('s1', 'step', 'Fetch data', { code: 'return 1' })]),
    )
    expect(withoutWait).not.toContain('isWorkflowTimeoutError')
  })

  it('keeps the project’s own handler file in a portable bundle', () => {
    const bundle = generateUniversalWorkflowBundle(
      ir([node('s1', 'step', 'Fetch data', { code: 'return 1' })], {
        runtime: {
          files: [
            { path: 'handlers.ts', source: '@fetch function handler() {}' },
            { path: 'lib/format.ts', source: 'export const x = 1' },
          ],
        },
      }),
    )
    expect(bundle.files.map((file) => file.path)).toContain('lib/format.ts')
    expect(bundle.files.map((file) => file.path)).toContain('handlers.ts')
  })

  it('writes env names into a plain string Env interface', () => {
    const bundle = generateUniversalWorkflowBundle(
      ir([node('s1', 'step', 'Call API', { code: 'return fetch(env.API_URL)' })]),
      { envVarNames: ['API_KEY'] },
    )

    const env = bundle.files.find((file) => file.path === UNIVERSAL_ENV_PATH)!.source
    expect(env).toContain('API_KEY: string;')
    expect(env).toContain('API_URL: string;')
    expect(env).not.toMatch(/KVNamespace|D1Database|R2Bucket|Fetcher|Workflow/)
  })

  it('keeps the portable step syntax for branches and parallel paths', () => {
    const code = generateUniversalWorkflow(
      ir(
        [
          node('br', 'branch', 'Check', { branches: [{ label: 'yes', condition: 'true' }] }),
          node('p', 'parallel', 'Fan out'),
          node('s1', 'step', 'Work', { code: 'return 1' }),
        ],
        {
          edges: [
            { id: 'e1', source: 'br', target: 'p', label: 'yes' },
            { id: 'e2', source: 'p', target: 's1', label: 'one' },
          ],
        },
      ),
    )

    expect(code).toContain('if (true)')
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('flow.step(')
  })

  it('emits a provider-neutral call for a sub-workflow', () => {
    const code = generateUniversalWorkflow(
      ir([
        node('sub', 'sub_workflow', 'Onboard', {
          workflowId: 'onboarding',
          workflowName: 'OnboardingWorkflow',
          waitForCompletion: false,
        }),
      ]),
    )
    expect(code).toContain(
      'flow.startWorkflow({ workflow: "onboarding", exportName: "OnboardingWorkflow", waitForCompletion: false })',
    )
    expect(code).not.toMatch(/cloudflare/i)
  })

  it('emits a provider-neutral call for a sub-script', () => {
    const code = generateUniversalWorkflow(
      ir([
        node('call', 'sub_script', 'Pricing', {
          scriptId: 'pricing-svc',
          method: 'GET',
          url: 'https://pricing/quote',
          params: { cf: { binding: 'PRICING' } },
        }),
      ]),
    )
    expect(code).toContain(
      'flow.callScript({ script: "pricing-svc", method: "GET", url: "https://pricing/quote", params: {"cf":{"binding":"PRICING"}} })',
    )
    expect(code).not.toMatch(/cloudflare/i)
  })

  it('gives a portable function with a sub call an optional platform parameter', () => {
    const script = {
      ...ir([
        node('call', 'sub_script', 'Pricing', {
          scriptId: 'pricing-svc',
          method: 'GET',
          url: 'https://pricing/quote',
        }),
      ]),
      kind: 'script' as const,
    }
    const bundle = generateUniversalFunctionBundle(script)
    expect(bundle.files.map((file) => file.path)).not.toContain('awaitstep/platform.ts')
    const source = bundle.files.find((file) => file.path === UNIVERSAL_FUNCTION_PATH)!.source
    expect(source).toContain('platform?: PlatformHost')
    expect(source).toContain('flow.callScript(')
    expect(source).not.toMatch(/cloudflare/i)
  })

  it('carries the step manifest so a runner can map labels back to nodes', () => {
    const bundle = generateUniversalWorkflowBundle(
      ir([node('s1', 'step', 'Fetch data', { code: 'return 1' })]),
    )
    expect(bundle.manifest?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 's1', filePath: 'steps/s1.ts', stepName: 's1' }),
      ]),
    )
  })
})

describe('generateUniversalFunctionBundle', () => {
  it('emits a portable runGraph with no provider bootstrap', () => {
    const script = {
      ...ir([node('s1', 'step', 'Fetch data', { code: 'return 42', export: true })]),
      kind: 'script' as const,
    }
    const bundle = generateUniversalFunctionBundle(script)

    expect(bundle.entry).toBe(UNIVERSAL_FUNCTION_PATH)
    expect(bundle.files.some((file) => file.path === 'worker.ts')).toBe(false)
    const source = bundle.files.find((file) => file.path === UNIVERSAL_FUNCTION_PATH)!.source
    expect(source).toContain('export async function runGraph(env: Env')
    expect(source).not.toMatch(/cloudflare/i)
    expect(source).not.toContain('export default {')
    expect(source).toContain('return { Fetch_data }')
  })
})
