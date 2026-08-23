import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflow } from '../../codegen/generate.js'

function node(id: string, type: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

describe('branch-arm expression resolution', () => {
  it('resolves expressions that appear only in branch conditions', () => {
    // Regression guard: detection (containsExpressions) must cover branch
    // arms, or the condition ships as literal `if ({{check.ok}})` — a
    // SyntaxError in the generated worker.
    const ir: WorkflowIR = {
      metadata: { name: 'BranchExpr', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'check',
      nodes: [
        node('check', 'step', { code: 'return { ok: true };' }),
        node('gate', 'branch', {
          branches: [
            { label: 'yes', condition: '{{check.ok}}' },
            { label: 'no', condition: '' },
          ],
        }),
        node('happy', 'step', { code: 'return 1;' }),
        node('sad', 'step', { code: 'return 0;' }),
      ],
      edges: [
        { id: 'e1', source: 'check', target: 'gate' },
        { id: 'e2', source: 'gate', target: 'happy', label: 'yes' },
        { id: 'e3', source: 'gate', target: 'sad', label: 'no' },
      ],
    }
    const code = generateWorkflow(ir)
    expect(code).not.toContain('{{check.ok}}')
    expect(code).toContain('if (check.ok)')
  })
})
