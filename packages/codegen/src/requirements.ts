import type { ArtifactIR } from '@awaitstep/ir'
import { isProjectCodePath } from '@awaitstep/ir'
import { AWAITSTEP_IMPORT_PREFIX } from './runtime.js'

/**
 * Something a workflow needs from its runtime beyond pure orchestration.
 *
 * - `provider` — a provider-scoped primitive import (`#awaitstep/cloudflare`).
 *   Only that provider can run the workflow.
 * - `binding` — a resource the runtime must supply (KV, D1, R2, a service
 *   binding, …). A provider may be able to satisfy it; the target decides.
 */
export interface RuntimeRequirement {
  kind: 'provider' | 'binding'
  /** Provider id (`cloudflare`) for `provider`, binding kind (`kv`) for `binding`. */
  id: string
  /** Declared binding name, for `binding`. */
  name?: string
  /** The import specifier that introduced a provider requirement. */
  import?: string
  /** Human label for diagnostics, e.g. `KV namespace "USERS"`. */
  label: string
  nodeId?: string
  /** The source file the requirement was found in, when it was a file. */
  path?: string
}

/** What a provider says about a requirement. */
export interface RequirementSupport {
  supported: boolean
  /** Why not, in the user's terms. */
  reason?: string
}

/** The provider side of the check: a name plus what it can supply. */
export interface RequirementTarget {
  readonly name: string
  readonly supportedBindingKinds?: readonly string[]
  supportsRequirement?(requirement: RuntimeRequirement): RequirementSupport
}

/** One requirement the target cannot satisfy, with the provider's reason. */
export interface UnsupportedRequirement {
  requirement: RuntimeRequirement
  reason: string
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  cloudflare: 'Cloudflare',
}

const BINDING_LABELS: Readonly<Record<string, string>> = {
  kv: 'KV namespace',
  d1: 'D1 database',
  r2: 'R2 bucket',
  queue: 'queue',
  service: 'service binding',
  workflow: 'workflow binding',
  ai: 'Workers AI binding',
  vectorize: 'Vectorize index',
  analytics_engine: 'Analytics Engine dataset',
  hyperdrive: 'Hyperdrive config',
  browser: 'Browser Rendering binding',
}

/** The display name of a binding kind, falling back to the kind itself. */
export function describeBindingKind(kind: string): string {
  return BINDING_LABELS[kind] ?? kind
}

/** The display name of a provider, falling back to its id. */
export function describeProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

/** The provider a `#awaitstep/<provider>` import requires, or null for core runtime. */
export function providerFromAwaitstepImport(specifier: string): string | null {
  if (!specifier.startsWith(AWAITSTEP_IMPORT_PREFIX)) return null
  const segment = specifier.slice(AWAITSTEP_IMPORT_PREFIX.length).split('/')[0]
  if (!segment || segment === 'runtime') return null
  return segment
}

/**
 * The provider a specifier requires: a provider-scoped primitive
 * (`#awaitstep/cloudflare`) or the provider's own platform modules
 * (`cloudflare:*`). A `cloudflare:workers` import in a step or project file is
 * just as Cloudflare-only as a KV primitive.
 */
export function providerFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith('cloudflare:')) return 'cloudflare'
  return providerFromAwaitstepImport(specifier)
}

/**
 * Every provider-scoped import in a set of sources. The core runtime
 * (`#awaitstep/runtime`) is deliberately not a requirement.
 */
export function collectProviderImports(
  sources: Iterable<string>,
): { provider: string; specifier: string }[] {
  const found: { provider: string; specifier: string }[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const specifier of importSpecifiers(source)) {
      const provider = providerFromSpecifier(specifier)
      if (!provider || seen.has(provider)) continue
      seen.add(provider)
      found.push({ provider, specifier })
    }
  }
  return found
}

/** Provider-scoped imports and declared bindings an artifact needs. */
export function collectRuntimeRequirements(ir: ArtifactIR): RuntimeRequirement[] {
  const requirements = new Map<string, RuntimeRequirement>()

  const sources: { source: string; nodeId?: string; path?: string }[] = []
  for (const node of ir.nodes) {
    // Only the code field is code. Other data values are config text, and a
    // `#awaitstep/cloudflare` written in a label or description is not a use.
    if (typeof node.data.code === 'string') {
      sources.push({ source: node.data.code, nodeId: node.id })
    }
  }
  if (ir.runtime?.triggerCode) sources.push({ source: ir.runtime.triggerCode })
  for (const file of ir.runtime?.files ?? []) {
    // Assets (README, data files) are not code and cannot import anything.
    if (!isProjectCodePath(file.path)) continue
    sources.push({ source: file.source, path: file.path })
  }

  for (const source of sources) {
    for (const specifier of importSpecifiers(withoutComments(source.source))) {
      const provider = providerFromSpecifier(specifier)
      if (!provider) continue
      const key = `provider:${provider}`
      if (requirements.has(key)) continue
      requirements.set(key, {
        kind: 'provider',
        id: provider,
        import: specifier,
        label: `${describeProvider(provider)}-only primitives (${specifier})`,
        ...(source.nodeId && { nodeId: source.nodeId }),
        ...(source.path && { path: source.path }),
      })
    }
  }

  for (const binding of ir.runtime?.bindings ?? []) {
    const key = `binding:${binding.type}:${binding.name}`
    if (requirements.has(key)) continue
    requirements.set(key, {
      kind: 'binding',
      id: binding.type,
      name: binding.name,
      label: `${describeBindingKind(binding.type)} "${binding.name}"`,
    })
  }

  return [...requirements.values()]
}

/** Merges provider-specific requirements into a collected list, keeping order and dropping duplicates. */
export function mergeRequirements(
  ...lists: readonly (readonly RuntimeRequirement[])[]
): RuntimeRequirement[] {
  const merged = new Map<string, RuntimeRequirement>()
  for (const list of lists) {
    for (const requirement of list) {
      const key = `${requirement.kind}:${requirement.id}:${requirement.name ?? ''}`
      if (!merged.has(key)) merged.set(key, requirement)
    }
  }
  return [...merged.values()]
}

/**
 * Which requirements the target provider cannot satisfy. A provider may
 * answer itself; otherwise a provider primitive must name that provider and
 * a binding kind must be in its declared list.
 */
export function checkRequirements(
  requirements: readonly RuntimeRequirement[],
  target: RequirementTarget,
): UnsupportedRequirement[] {
  const unsupported: UnsupportedRequirement[] = []
  for (const requirement of requirements) {
    const verdict = target.supportsRequirement
      ? target.supportsRequirement(requirement)
      : defaultSupport(requirement, target)
    if (!verdict.supported) {
      unsupported.push({
        requirement,
        reason: verdict.reason ?? `${target.name} does not support it`,
      })
    }
  }
  return unsupported
}

function defaultSupport(
  requirement: RuntimeRequirement,
  target: RequirementTarget,
): RequirementSupport {
  if (requirement.kind === 'provider') {
    return requirement.id === target.name
      ? { supported: true }
      : { supported: false, reason: `requires the ${requirement.id} provider` }
  }
  const kinds = target.supportedBindingKinds ?? []
  return kinds.includes(requirement.id)
    ? { supported: true }
    : { supported: false, reason: `${target.name} cannot supply a ${requirement.label}` }
}

/** One sentence a deploy refusal can show, naming the target and every requirement. */
export function formatUnsupportedRequirements(
  target: string,
  unsupported: readonly UnsupportedRequirement[],
): string {
  const requirements = unsupported.map(({ requirement }) => requirement.label).join('; ')
  return `Cannot deploy to ${target}: this workflow requires ${requirements}. Choose a compatible connection or remove the provider-specific code.`
}

/**
 * Import specifiers in a source, in order of appearance, duplicates removed.
 * Shared with the IDE's type acquisition and the deploy's import check so all
 * three read code the same way.
 *
 * Linear on purpose: the previous lazy quantifier before `from` backtracked
 * quadratically on a few hundred KB of `import import …` (seconds of blocked
 * CPU per request). Each pattern below only ever consumes a literal.
 */
export function importSpecifiers(source: string): string[] {
  const found = new Map<number, string>()
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1] ?? match[2] ?? match[3]
      if (specifier === undefined || found.has(match.index!)) continue
      found.set(match.index!, specifier)
    }
  }
  const ordered = [...found.entries()].sort(([a], [b]) => a - b).map(([, specifier]) => specifier)
  return [...new Set(ordered)]
}

/**
 * A source with comments and type-only imports removed: the text an import
 * analysis should read. String-aware and linear: a `//` inside a string is
 * not a comment, and an unterminated `/*` does not backtrack.
 *
 * Type-only imports are stripped line-by-line. A type-only statement split
 * across lines can survive this and read as a requirement — conservative,
 * and rare enough to accept.
 */
export function withoutComments(source: string): string {
  const parts: string[] = []
  let start = 0
  let index = 0
  while (index < source.length) {
    const char = source[index]!
    if (char === '"' || char === "'" || char === '`') {
      index += 1
      while (index < source.length) {
        const current = source[index]!
        if (current === '\\') {
          index += 2
          continue
        }
        if (current === char) {
          index += 1
          break
        }
        index += 1
      }
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      parts.push(source.slice(start, index))
      while (index < source.length && source[index] !== '\n') index += 1
      start = index
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      parts.push(source.slice(start, index))
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      start = index
      continue
    }
    index += 1
  }
  parts.push(source.slice(start))
  return parts.join('').replace(TYPE_ONLY_LINE, '')
}

const TYPE_ONLY_LINE = /\b(?:import|export)\s+type\b[^\n]*/g

const SPECIFIER_PATTERNS = [
  // from 'x' / import 'x' / export * from "x" / import{x}from"x" / backtick
  /(?:\bfrom|\bimport)\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`$\n]+)`)/g,
  // import('x') / require("x")
  /\b(?:import|require)\s*\(\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`$\n]+)`)\s*[,)]/g,
]
