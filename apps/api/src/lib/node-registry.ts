import { readFile } from 'node:fs/promises'
import { NodeRegistry } from '@awaitstep/ir'
import type { NodeDefinition, NodeBundle } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import type { InstalledNode } from '@awaitstep/db'

interface RegistryFile {
  definitions: NodeDefinition[]
  templates: Record<string, Record<string, string>>
}

export interface AppNodeRegistry {
  registry: NodeRegistry
  templateResolver: TemplateResolver
  templates: Record<string, Record<string, string>>
}

export async function loadNodeRegistry(registryPath: string): Promise<AppNodeRegistry> {
  const raw = await readFile(registryPath, 'utf-8')
  const data = JSON.parse(raw) as RegistryFile

  const registry = new NodeRegistry()
  for (const def of data.definitions) {
    registry.register(def)
  }

  const templates = new Map<string, Map<string, string>>()
  for (const [nodeType, providerMap] of Object.entries(data.templates)) {
    const inner = new Map<string, string>()
    for (const [provider, source] of Object.entries(providerMap)) {
      inner.set(provider, source)
    }
    templates.set(nodeType, inner)
  }

  const templateResolver: TemplateResolver = {
    getTemplate(nodeType: string, provider: string): string | undefined {
      return templates.get(nodeType)?.get(provider)
    },
  }

  return { registry, templateResolver, templates: data.templates }
}

export function createMergedNodeRegistry(
  base: AppNodeRegistry | undefined,
  installedNodes: InstalledNode[],
): AppNodeRegistry {
  const registry = new NodeRegistry()
  const mergedTemplates: Record<string, Record<string, string>> = {}

  // Start with builtins
  if (base) {
    for (const def of base.registry.getAll()) {
      registry.register(def)
    }
    Object.assign(mergedTemplates, base.templates)
  }

  // Layer installed nodes on top
  for (const row of installedNodes) {
    const bundle = JSON.parse(row.bundle) as NodeBundle
    registry.register(bundle.definition)
    const nodeTemplates: Record<string, string> = {}
    for (const [provider, source] of Object.entries(bundle.templates)) {
      if (source) nodeTemplates[provider] = source
    }
    mergedTemplates[bundle.definition.id] = nodeTemplates
  }

  const templateResolver: TemplateResolver = {
    getTemplate(nodeType: string, provider: string): string | undefined {
      return mergedTemplates[nodeType]?.[provider]
    },
  }

  return { registry, templateResolver, templates: mergedTemplates }
}
