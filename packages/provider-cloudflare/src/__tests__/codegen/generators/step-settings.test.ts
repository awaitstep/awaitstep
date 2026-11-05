import { describe, it, expect } from 'vitest'
import { createGenerationContext } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { appliedStepSettings } from '../../../codegen/generators/step-settings.js'
import { generateStep } from '../../../codegen/generators/step.js'
import { generateHttp } from '../../../codegen/generators/http.js'
import { generateSubScript } from '../../../codegen/generators/sub-script.js'
import { generateSubWorkflow } from '../../../codegen/generators/sub-workflow.js'
import { generateWaitForEvent } from '../../../codegen/generators/wait-for-event.js'
import { generateCustomNode } from '../../../codegen/generators/custom.js'
import { generateStepConfig } from '../../../codegen/generators/config.js'

const ctx = createGenerationContext([])

function node(type: string, data: WorkflowNode['data'], config?: WorkflowNode['config']) {
  return {
    id: 'n1',
    name: 'N',
    type,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
    ...(config && { config }),
  } as WorkflowNode
}

const LOOSE = { retryLimit: 4, retryDelay: '2 seconds', timeout: '30 seconds' }
const CONFIG = { retries: { limit: 3, delay: '5 seconds' }, timeout: '1 minute' } as const
const TEMPLATE = 'export default async function(ctx) { return 1; }'

/** Each kind with its generator, so the helper is checked against the real output. */
const kinds: Array<{
  name: string
  make: (data: WorkflowNode['data'], config?: WorkflowNode['config']) => WorkflowNode
  generate: (n: WorkflowNode) => string
}> = [
  {
    name: 'step',
    make: (d, c) => node('step', { code: 'return 1', ...d }, c),
    generate: (n) => generateStep(n, ctx),
  },
  {
    name: 'http_request',
    make: (d, c) => node('http_request', { url: 'https://x.test', method: 'GET', ...d }, c),
    generate: (n) => generateHttp(n, ctx),
  },
  {
    name: 'sub_script',
    make: (d, c) => node('sub_script', { workerName: 'w', ...d }, c),
    generate: (n) => generateSubScript(n, ctx),
  },
  {
    name: 'a registry node',
    make: (d, c) => node('webhook-post', d, c),
    generate: (n) => generateCustomNode(n, TEMPLATE, ctx),
  },
  {
    name: 'wait_for_event',
    make: (d, c) => node('wait_for_event', { eventType: 'e', ...d }, c),
    generate: (n) => generateWaitForEvent(n, ctx),
  },
  {
    name: 'sub_workflow',
    make: (d, c) =>
      node(
        'sub_workflow',
        { workflowId: 'w', workflowName: 'W', waitForCompletion: false, ...d },
        c,
      ),
    generate: (n) => generateSubWorkflow(n, ctx),
  },
]

describe('appliedStepSettings agrees with what the generators emit', () => {
  for (const kind of kinds) {
    it(`${kind.name}: loose data fields and node.config`, () => {
      for (const [data, config] of [
        [LOOSE, undefined],
        [{}, CONFIG],
        [LOOSE, CONFIG],
        [{}, undefined],
      ] as const) {
        const n = kind.make({ ...data }, config as WorkflowNode['config'])
        const applied = appliedStepSettings(n)
        const emitted = kind.generate(n)
        // wait_for_event writes its timeout into the event options, not a step config.
        const expected =
          kind.name === 'wait_for_event'
            ? applied.config && `timeout: ${JSON.stringify(applied.config.timeout)}`
            : generateStepConfig(applied.config)
        if (expected) {
          expect(emitted).toContain(expected)
        } else {
          expect(emitted).not.toMatch(/retries:\s*{\s*limit:\s*[34]\b/)
          expect(emitted).not.toMatch(/timeout:\s*"(30 seconds|1 minute)"/)
        }
        // Whatever the helper says is applied must be what is in the code.
        if (!applied.retries) expect(emitted).not.toMatch(/retries:\s*{\s*limit:\s*[34]\b/)
        if (!applied.timeout) expect(emitted).not.toMatch(/timeout:\s*"(30 seconds|1 minute)"/)
      }
    })
  }

  it('step uses the loose fields and fills the missing half with the emitter’s defaults', () => {
    const applied = appliedStepSettings(node('step', { retryLimit: 2 }))
    expect(applied.config).toEqual({ retries: { limit: 2, delay: '10 seconds' } })
  })

  it('http_request ignores the loose fields: a new node’s stored retryLimit is not applied', () => {
    const applied = appliedStepSettings(node('http_request', { retryLimit: 5 }))
    expect(applied.config).toBeUndefined()
    expect(applied.retries).toBe(true)
  })

  it('wait_for_event takes a timeout only', () => {
    const applied = appliedStepSettings(node('wait_for_event', { timeout: '48 hours' }))
    expect(applied).toEqual({ retries: false, timeout: true, config: { timeout: '48 hours' } })
  })

  it.each(['sub_workflow', 'sleep', 'branch', 'loop', 'try_catch', 'parallel', 'race', 'break'])(
    '%s takes neither',
    (type) => {
      expect(appliedStepSettings(node(type, LOOSE, CONFIG))).toEqual({
        retries: false,
        timeout: false,
        config: undefined,
      })
    },
  )

  it('an inline step takes neither', () => {
    expect(appliedStepSettings(node('step', { inline: true, ...LOOSE })).retries).toBe(false)
  })
})
