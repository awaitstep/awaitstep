import { templateCategories, workflowTemplates } from '@awaitstep/templates'
import { describe, expect, it } from 'vitest'
import { stepLabel } from '../flow'
import { CASE_COPY, markSteps, USE_CASES } from '../use-cases'

describe('the use cases page data', () => {
  it('tells one case per template category, in the app’s order', () => {
    expect(USE_CASES.map((u) => u.categoryId)).toEqual(templateCategories.map((c) => c.id))
  })

  it('tells each case through a template the app ships, from its own category', () => {
    for (const u of USE_CASES) {
      const template = workflowTemplates.find((t) => t.id === u.templateId)
      expect(template?.category).toBe(u.categoryId)
    }
  })

  it('names only steps the template has in its points', () => {
    for (const [category, copy] of Object.entries(CASE_COPY)) {
      const template = workflowTemplates.find((t) => t.id === copy.templateId)!
      const stepNames = template.ir.nodes.map((n) => stepLabel(n.name))
      const named = copy.points.flatMap((p) =>
        stepNames.filter((s) => s.split(' ').length > 1 && p.line.includes(s)),
      )
      expect(named.length, `${category} names at least one real step`).toBeGreaterThan(0)
    }
  })

  it('draws every step of the template', () => {
    for (const u of USE_CASES) {
      const template = workflowTemplates.find((t) => t.id === u.templateId)!
      expect(u.flow.nodes).toHaveLength(template.ir.nodes.length)
    }
  })

  it('lists the category’s other templates', () => {
    const billing = USE_CASES.find((u) => u.categoryId === 'billing')!
    expect(billing.more).toEqual(
      workflowTemplates
        .filter((t) => t.category === 'billing' && t.id !== billing.templateId)
        .map((t) => t.name),
    )
  })
})

describe('markSteps', () => {
  it('marks the step names a line mentions, longest first', () => {
    expect(
      markSteps('After two hours, Send reminder emails them.', ['Send', 'Send reminder']),
    ).toEqual([
      { text: 'After two hours, ', step: false },
      { text: 'Send reminder', step: true },
      { text: ' emails them.', step: false },
    ])
  })

  it('leaves a line with no step names as one plain run', () => {
    expect(markSteps('Nothing to mark.', ['Read order'])).toEqual([
      { text: 'Nothing to mark.', step: false },
    ])
  })

  it('marks at least one step in every case on the page', () => {
    for (const u of USE_CASES) {
      expect(
        u.points.some((p) => p.segments.some((s) => s.step)),
        u.templateId,
      ).toBe(true)
    }
  })
})
