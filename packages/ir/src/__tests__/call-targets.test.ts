import { describe, expect, it } from 'vitest'
import { callTargets } from '../call-targets.js'

const node = (id: string, type: string, data: Record<string, unknown>) =>
  ({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }) as never

describe('callTargets', () => {
  it('lists what Call Workflow and Call Function nodes name, and nothing else', () => {
    expect(
      callTargets({
        nodes: [
          node('a', 'sub_workflow', { workflowId: ' wf_1 ' }),
          node('b', 'sub_script', { scriptId: 'orders-fn' }),
          node('c', 'step', { workflowId: 'not-a-call' }),
          node('d', 'sub_workflow', { workflowId: '' }),
          node('e', 'sub_script', {}),
          node('f', 'sub_script', { workerName: 'older-fn' }),
        ],
      }),
    ).toEqual([
      { nodeId: 'a', target: 'wf_1' },
      { nodeId: 'b', target: 'orders-fn' },
      { nodeId: 'f', target: 'older-fn' },
    ])
  })
})
