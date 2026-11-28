import { NodeRegistry, nodeDefinitionSchema } from '@awaitstep/ir'
import type { NodeDefinition, NodeBundle } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import type { InstalledNode } from '@awaitstep/db'

export interface RegistryFile {
  definitions: NodeDefinition[]
  templates: Record<string, Record<string, string>>
}

export interface AppNodeRegistry {
  registry: NodeRegistry
  templateResolver: TemplateResolver
  templates: Record<string, Record<string, string>>
  /** Ids an extension's node holds: an installed or custom node never takes their place. */
  reserved?: ReadonlySet<string>
}

export function buildNodeRegistry(data: RegistryFile): AppNodeRegistry {
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
    getTemplate(nodeType: string, provider?: string): string | undefined {
      const byProvider = templates.get(nodeType)
      if (!byProvider) return undefined
      return provider ? byProvider.get(provider) : byProvider.values().next().value
    },
    // The node's node.json runtime hints: its durable step's default retries and timeout.
    getRuntime: (nodeType: string) => registry.get(nodeType)?.runtime,
  }

  return { registry, templateResolver, templates: data.templates }
}

/** A node an extension brings: its definition, and its template source by provider id. */
export interface ExtensionNode {
  definition: NodeDefinition
  templates: Readonly<Record<string, string>>
}

/**
 * The instance's registry with the extensions' nodes added, so they are
 * listed, validated and generated like the built-in ones. Refused at
 * startup: a definition the schema does not take, a node with no template,
 * and an id that is built in or brought twice. With no nodes to add, `base`
 * comes back as it was (absent included).
 */
export function withExtensionNodes(
  base: AppNodeRegistry | undefined,
  extensions: readonly { id: string; nodes?: readonly ExtensionNode[] }[],
): AppNodeRegistry | undefined {
  const added = extensions.flatMap((extension) =>
    (extension.nodes ?? []).map((node) => ({ extension: extension.id, node })),
  )
  if (added.length === 0) return base
  const definitions = base ? [...base.registry.getAll()] : []
  const templates: Record<string, Record<string, string>> = Object.assign(
    Object.create(null),
    base?.templates,
  )
  const taken = new Set(definitions.map((definition) => definition.id))
  for (const { extension, node } of added) {
    const parsed = nodeDefinitionSchema.safeParse(node.definition)
    if (!parsed.success) {
      const id = String((node.definition as { id?: unknown } | undefined)?.id)
      throw new Error(
        `Extension "${extension}" brings a node ("${id}") with an invalid definition: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      )
    }
    const { id } = node.definition
    if (taken.has(id)) {
      throw new Error(`Extension "${extension}" brings a node "${id}" that is already registered.`)
    }
    const sources = Object.entries(node.templates).filter(([, source]) => source)
    if (sources.length === 0) {
      throw new Error(`Extension "${extension}" brings a node "${id}" with no template.`)
    }
    taken.add(id)
    definitions.push(node.definition)
    templates[id] = Object.fromEntries(sources)
  }
  return {
    ...buildNodeRegistry({ definitions, templates }),
    reserved: new Set(added.map(({ node }) => node.definition.id)),
  }
}

/**
 * The registry a prepare generates with: the builtins, then installed
 * marketplace nodes, then the workflow's custom nodes (each `custom:<itemId>`
 * at its latest published version, Cloudflare template only). An extension's
 * node keeps its id: an installed or custom node with that id is left out.
 */
export function createMergedNodeRegistry(
  base: AppNodeRegistry | undefined,
  installedNodes: InstalledNode[],
  customNodes: readonly { definition: NodeDefinition; template: string }[] = [],
): AppNodeRegistry {
  const registry = new NodeRegistry()
  const mergedTemplates: Record<string, Record<string, string>> = Object.create(null)

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
    if (base?.reserved?.has(bundle.definition.id)) continue
    registry.register(bundle.definition)
    const nodeTemplates: Record<string, string> = {}
    for (const [provider, source] of Object.entries(bundle.templates)) {
      if (source) nodeTemplates[provider] = source
    }
    mergedTemplates[bundle.definition.id] = nodeTemplates
  }

  for (const custom of customNodes) {
    if (base?.reserved?.has(custom.definition.id)) continue
    registry.register(custom.definition)
    mergedTemplates[custom.definition.id] = { cloudflare: custom.template }
  }

  const templateResolver: TemplateResolver = {
    getTemplate(nodeType: string, provider?: string): string | undefined {
      if (!Object.hasOwn(mergedTemplates, nodeType)) return undefined
      const byProvider = mergedTemplates[nodeType]!
      if (!provider) return Object.values(byProvider)[0]
      return Object.hasOwn(byProvider, provider) ? byProvider[provider] : undefined
    },
    getRuntime: (nodeType: string) => registry.get(nodeType)?.runtime,
  }

  return {
    registry,
    templateResolver,
    templates: mergedTemplates,
    ...(base?.reserved && { reserved: base.reserved }),
  }
}
