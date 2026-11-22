import { describe, expect, it } from 'vitest'
import {
  REGISTRY_NODES,
  templateCategories,
  templateRegistryNodes,
  workflowTemplates,
} from '../index'

describe('workflowTemplates', () => {
  it('gives every template a unique id', () => {
    const ids = workflowTemplates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('files every template under a known category, and every category has templates', () => {
    const known = new Set(templateCategories.map((c) => c.id))
    for (const t of workflowTemplates) expect(known.has(t.category)).toBe(true)
    for (const c of templateCategories) {
      expect(workflowTemplates.some((t) => t.category === c.id)).toBe(true)
    }
  })

  it('names each template icon in kebab case', () => {
    for (const t of workflowTemplates) expect(t.icon).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('starts every template at a node it has', () => {
    for (const t of workflowTemplates) {
      expect(t.ir.nodes.some((n) => n.id === t.ir.entryNodeId)).toBe(true)
    }
  })

  // A step's code becomes a module that reads earlier values from `inputs`;
  // a `{{…}}` left in it is not JavaScript.
  it('reads earlier values in step code by name, not through {{…}}', () => {
    const offenders = workflowTemplates.flatMap((t) =>
      t.ir.nodes
        .filter((n) => n.type === 'step' && String(n.data.code ?? '').includes('{{'))
        .map((n) => `${t.id}/${n.id}`),
    )
    expect(offenders).toEqual([])
  })
})

describe('templateRegistryNodes', () => {
  it('lists the registry nodes a template uses, once each, in first-use order', () => {
    const usesResend = workflowTemplates.find((t) => t.ir.nodes.some((n) => n.type === 'resend'))
    expect(usesResend).toBeDefined()
    const names = templateRegistryNodes(usesResend!)
    expect(names).toContain(REGISTRY_NODES.resend.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
