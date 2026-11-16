import { describe, it, expect } from 'vitest'
import {
  bundledNodeDefinitions,
  validateIR,
  type NodeRegistry,
  type WorkflowIR,
} from '@awaitstep/ir'
import { generateWorkflowBundle } from '@awaitstep/provider-cloudflare'
import {
  REGISTRY_NODES,
  templateCategories,
  templateRegistryNodes,
  workflowTemplates,
} from '../workflow-templates'
import { validateWorkflowForPublish } from '../validate-workflow'
import {
  installedRegistry,
  registryBase,
  registryDefinition,
  registryTemplate,
  registryVersions,
} from './fixtures/registry-nodes'
import { unknownNames } from './fixtures/unknown-names'

const NOT_INSTALLED = /isn’t installed/

function canvasNodes(ir: WorkflowIR) {
  return ir.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position ?? { x: 0, y: 0 },
    data: { irNode: node },
  }))
}

function publishIssues(ir: WorkflowIR, registry: NodeRegistry) {
  return validateWorkflowForPublish(ir.metadata, canvasNodes(ir), ir.edges, registry).issues
}

const allInstalled = installedRegistry(
  Object.fromEntries(Object.entries(REGISTRY_NODES).map(([type, n]) => [type, n.version])),
)

describe('workflow templates', () => {
  it('ships 16 templates and no Hello World', () => {
    expect(workflowTemplates).toHaveLength(16)
    expect(workflowTemplates.map((t) => t.id)).not.toContain('hello-world')
  })

  it('puts every template in a known section, and every section has templates', () => {
    const ids = new Set(templateCategories.map((c) => c.id))
    for (const template of workflowTemplates) expect(ids).toContain(template.category)
    for (const category of templateCategories) {
      expect(workflowTemplates.some((t) => t.category === category.id)).toBe(true)
    }
  })

  it('gives every template a unique id', () => {
    const ids = workflowTemplates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['failed-payment-recovery', ['Resend']],
    ['usage-sync', ['Slack']],
    ['approval', ['Slack']],
    ['win-back', ['Resend', 'Slack']],
    ['inbound-webhook', []],
  ])('lists the registry nodes "%s" uses on its card', (id, names) => {
    expect(templateRegistryNodes(workflowTemplates.find((t) => t.id === id)!)).toEqual(names)
  })

  describe.each(Object.entries(REGISTRY_NODES))('registry node "%s"', (type, pinned) => {
    it('pins the newest published version', () => {
      expect(registryVersions(type).at(-1)).toBe(pinned.version)
    })

    it('uses the registry’s display name', () => {
      expect(registryBase(type).name).toBe(pinned.name)
    })
  })

  describe.each(workflowTemplates.map((t) => [t.name, t] as const))('"%s"', (_name, template) => {
    const { ir } = template

    it('passes IR validation', () => {
      const result = validateIR(ir)
      if (!result.ok)
        throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'))
    })

    it('is a starting point: 3 to 6 nodes', () => {
      expect(ir.nodes.length).toBeGreaterThanOrEqual(3)
      expect(ir.nodes.length).toBeLessThanOrEqual(6)
    })

    it('has unique node and edge ids', () => {
      const nodeIds = ir.nodes.map((n) => n.id)
      const edgeIds = ir.edges.map((e) => e.id)
      expect(new Set(nodeIds).size).toBe(nodeIds.length)
      expect(new Set(edgeIds).size).toBe(edgeIds.length)
    })

    it('saves with no errors once its registry nodes are installed', () => {
      const errors = publishIssues(ir, allInstalled).filter((i) => i.severity === 'error')
      expect(errors).toEqual([])
    })

    it('loads before they are installed, with only "isn’t installed" errors', () => {
      const errors = publishIssues(ir, installedRegistry()).filter((i) => i.severity === 'error')
      const registryNodeCount = ir.nodes.filter((n) => Object.hasOwn(REGISTRY_NODES, n.type)).length
      expect(errors).toHaveLength(registryNodeCount)
      for (const error of errors) expect(error.message).toMatch(NOT_INSTALLED)
    })

    it('pins each registry node to a published version', () => {
      for (const node of ir.nodes.filter((n) => Object.hasOwn(REGISTRY_NODES, n.type))) {
        expect(registryVersions(node.type)).toContain(node.version)
      }
    })

    const bundle = () =>
      generateWorkflowBundle(ir, {
        templateResolver: {
          getTemplate: (type) => {
            const node = ir.nodes.find((n) => n.type === type)
            return node ? registryTemplate(type, node.version) : undefined
          },
        },
      })

    it('generates code where every name a step reads is passed in or declared', () => {
      expect(unknownNames(bundle().files)).toEqual([])
    })

    it('leaves no expression uncompiled and no node reference quoted as text', () => {
      const ids = ['event', ...ir.nodes.map((n) => n.id)].join('|')
      const quotedRef = new RegExp(`"(?:${ids})\\.[\\w.]+"`)
      for (const file of bundle().files.filter((f) => !f.path.startsWith('awaitstep/runtime'))) {
        expect(file.source, file.path).not.toContain('{{')
        expect(file.source, file.path).not.toMatch(quotedRef)
      }
    })

    it('reads only fields a node returns: a wait’s event under payload, a registry node’s outputs', () => {
      const outputs = (id: string): string[] | undefined => {
        if (id === 'event') return ['payload']
        const node = ir.nodes.find((n) => n.id === id)
        if (!node) return undefined
        const definition = Object.hasOwn(REGISTRY_NODES, node.type)
          ? registryDefinition(node.type, node.version)
          : bundledNodeDefinitions.find((d) => d.id === node.type)
        // A step returns whatever its code builds; nothing to check against.
        return node.type === 'step' ? undefined : Object.keys(definition?.outputSchema ?? {})
      }
      for (const node of ir.nodes) {
        for (const [, id, field] of JSON.stringify(node.data).matchAll(/\{\{(\w+)\.(\w+)/g)) {
          const known = outputs(id!)
          if (known) expect(known, `${node.id} reads ${id}.${field}`).toContain(field)
        }
      }
    })

    it('does something on every wait’s timeout, not just return a status', () => {
      for (const wait of ir.nodes.filter((n) => n.type === 'wait_for_event')) {
        const target = ir.nodes.find((n) => n.id === wait.data.onTimeoutNode)!
        expect(target, `${wait.id} has no timeout arm`).toBeDefined()
        expect(ir.edges).toContainEqual(
          expect.objectContaining({ source: wait.id, target: target.id, label: 'onTimeout' }),
        )
        const acts =
          Object.hasOwn(REGISTRY_NODES, target.type) ||
          target.type === 'http_request' ||
          String(target.data.code ?? '').includes('// TODO:')
        expect(acts, `${wait.id}'s timeout arm (${target.id}) does nothing`).toBe(true)
      }
    })
  })
})
