import { describe, it, expect } from 'vitest'
import { validateIR } from '@awaitstep/ir'
import { workflowTemplates } from '../workflow-templates'

describe('workflow templates', () => {
  it('has 10 templates', () => {
    expect(workflowTemplates).toHaveLength(11)
  })

  for (const template of workflowTemplates) {
    it(`"${template.name}" passes IR validation`, () => {
      const result = validateIR(template.ir)
      if (!result.ok) {
        throw new Error(
          `Validation failed for "${template.name}":\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
        )
      }
      expect(result.ok).toBe(true)
    })

    it(`"${template.name}" has correct nodeCount`, () => {
      expect(template.ir.nodes.length).toBe(template.nodeCount)
    })

    it(`"${template.name}" has unique node IDs`, () => {
      const ids = template.ir.nodes.map((n) => n.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it(`"${template.name}" has unique edge IDs`, () => {
      const ids = template.ir.edges.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  }
})
