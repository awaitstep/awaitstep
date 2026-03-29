import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateRace } from '../../../codegen/generators/race.js'
import { generateNodeCode } from '../../../codegen/generate.js'

const V = '1.0.0'
const P = 'cloudflare'

describe('generateRace', () => {
  it('generates Promise.race with branches', () => {
    const raceNode: WorkflowNode = {
      id: 'race-1',
      type: 'race',
      name: 'First wins',
      position: { x: 0, y: 0 },
      version: V,
      provider: P,
      data: {},
    }
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        raceNode,
        {
          id: 'a',
          type: 'step',
          name: 'Fast',
          position: { x: 0, y: 0 },
          version: V,
          provider: P,
          data: { code: 'return "fast";' },
        },
        {
          id: 'b',
          type: 'step',
          name: 'Slow',
          position: { x: 0, y: 0 },
          version: V,
          provider: P,
          data: { code: 'return "slow";' },
        },
      ],
      edges: [
        { id: 'e0', source: 'race-1', target: 'a' },
        { id: 'e1', source: 'race-1', target: 'b' },
      ],
      entryNodeId: 'race-1',
    }
    const code = generateRace(raceNode, ir, generateNodeCode)
    expect(code).toContain('Promise.race')
    expect(code).toContain('Fast')
    expect(code).toContain('Slow')
    expect(code).toContain('async () =>')
    expect(code).not.toContain('Promise.all')
    expect(code).toContain('await step.do("First wins"')
    expect(code).toContain('return await Promise.race')
  })

  it('handles no branches', () => {
    const raceNode: WorkflowNode = {
      id: 'race-1',
      type: 'race',
      name: 'Empty',
      position: { x: 0, y: 0 },
      version: V,
      provider: P,
      data: {},
    }
    const ir: WorkflowIR = {
      metadata: { name: 'test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [raceNode],
      edges: [],
      entryNodeId: 'race-1',
    }
    const code = generateRace(raceNode, ir, generateNodeCode)
    expect(code).toContain('// race: no branches')
  })
})
