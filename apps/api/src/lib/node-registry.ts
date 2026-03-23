import { readFile } from 'node:fs/promises'
import { NodeRegistry } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'

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
