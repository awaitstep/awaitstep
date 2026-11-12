import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from 'sucrase'
import { createGenerationContext, generateCustomNode } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { loadNodeSources, loadTemplates, mergeDefinition } from '../lib/definition.js'

const NODES_DIR = join(import.meta.dirname, '..', '..', 'nodes')

function sampleValue(field: Record<string, unknown>, key: string): unknown {
  if (field.type === 'secret') return undefined
  if (field.default !== undefined) return field.default
  if (field.type === 'number') return 1
  if (field.type === 'boolean') return false
  if (field.type === 'json') return '{}'
  if (field.type === 'code') return 'return 1'
  if (field.type === 'multiselect') {
    return Array.isArray(field.options) && field.options.length > 0 ? [field.options[0]] : []
  }
  if (field.type === 'select') {
    return Array.isArray(field.options) && field.options.length > 0 ? field.options[0] : 'option'
  }
  return `sample_${key}`
}

describe('registry templates', () => {
  it('generates valid code for every node template', async () => {
    const sources = await loadNodeSources(NODES_DIR)
    expect(sources.length).toBeGreaterThan(0)

    for (const source of sources) {
      for (const version of source.versions) {
        const definition =
          source.base && version.overrides
            ? mergeDefinition(source.base, version.overrides)
            : version.node
        if (!definition) continue
        const providers = Array.isArray(definition.providers)
          ? definition.providers.filter((value): value is string => typeof value === 'string')
          : []
        const templates = await loadTemplates(version.dir, providers)
        const configSchema =
          definition.configSchema !== null &&
          typeof definition.configSchema === 'object' &&
          !Array.isArray(definition.configSchema)
            ? (definition.configSchema as Record<string, Record<string, unknown>>)
            : {}
        const data: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(configSchema)) {
          const value = sampleValue(field, key)
          if (value !== undefined) data[key] = value
        }
        for (const [provider, template] of Object.entries(templates)) {
          if (!template) continue
          const node: WorkflowNode = {
            id: `test-${source.id}`,
            name: source.id,
            type: source.id,
            version: version.version,
            provider,
            position: { x: 0, y: 0 },
            data,
          }
          const context = createGenerationContext([{ id: node.id, name: node.name }])
          const code = generateCustomNode(node, template, context, 'workflow')
          expect(() =>
            transform(code, { transforms: ['typescript'], disableESTransforms: true }),
          ).not.toThrow()
          expect(code).not.toContain('ctx.')
        }
      }
    }
  })
})

describe('registry security guards', () => {
  const guards: Record<string, string> = {
    zendesk: 'Subdomain must be a Zendesk subdomain label',
    shopify: 'Store must be a Shopify store handle',
    jira: 'domain must be <tenant>.atlassian.net',
    datadog: 'Unsupported Datadog site',
    'direct-mail': 'Invalid Alibaba Cloud region ID',
    supabase: 'Supabase URL must be an https',
    'google-gemini': 'x-goog-api-key',
    salesforce: 'SALESFORCE_INSTANCE_URL must be',
    activecampaign: 'ACTIVECAMPAIGN_API_URL must be',
    'upstash-redis': 'UPSTASH_REDIS_REST_URL must be',
  }

  it('validates host/provider inputs in every published version', async () => {
    for (const [id, guard] of Object.entries(guards)) {
      const nodeDir = join(NODES_DIR, id)
      const versions = readdirSync(nodeDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
      expect(versions.length).toBeGreaterThan(0)
      for (const version of versions) {
        const source = readFileSync(join(nodeDir, version, 'template.ts'), 'utf-8')
        expect(source, `${id}@${version} is missing "${guard}"`).toContain(guard)
      }
    }
  })
})
