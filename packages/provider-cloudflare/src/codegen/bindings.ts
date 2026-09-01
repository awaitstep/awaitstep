import type { WorkflowIR } from '@awaitstep/ir'

export type BindingType =
  | 'kv'
  | 'd1'
  | 'r2'
  | 'queue'
  | 'secret'
  | 'variable'
  | 'service'
  | 'ai'
  | 'vectorize'
  | 'analytics_engine'
  | 'hyperdrive'
  | 'browser'

export interface BindingRequirement {
  name: string
  type: BindingType
  source: 'env-binding' | 'code-scan'
  nodeId?: string
  resourceId?: string
}

/**
 * Derives a JS identifier from a `QUEUE_*` binding name. Used by the
 * "+ Consume" snippet in the bindings panel — produces a name suitable
 * for a JS function declaration (`@queue function <name>(...)`).
 *
 * - `QUEUE_EMAILS` → `emails`
 * - `QUEUE_FOO_BAR` → `foo_bar` (keeps underscores — valid JS identifier)
 * - bare `QUEUE` → `queue`
 *
 * Note: this is NOT the final CF queue name. CF requires lowercase
 * alphanumeric + hyphens only, with no underscores. Pipe the result
 * through `toCFQueueName` for the wrangler.json `queue` field.
 */
export function deriveQueueName(bindingName: string): string {
  const stripped = bindingName.replace(/^QUEUE_?/i, '')
  return (stripped || bindingName).toLowerCase()
}

/**
 * Normalizes any input string into a Cloudflare-valid queue name.
 * CF rule (from wrangler validation): "Queue names can only contain
 * hyphens & alphanumeric lowercase letters."
 *
 * Conversion:
 * - Splits camelCase/PascalCase boundaries with hyphens
 * - Replaces underscores with hyphens
 * - Replaces any other non-`[a-z0-9-]` char with hyphens
 * - Collapses runs of hyphens
 * - Trims leading/trailing hyphens
 * - Lowercases the result
 *
 * Examples:
 * - `marktplaats_processor` → `marktplaats-processor`
 * - `marktplaatsProcessor` → `marktplaats-processor`
 * - `MARKTPLAATS_PROCESSOR` → `marktplaats-processor`
 * - `simple` → `simple`
 *
 * Used in three places that MUST agree on the same name, otherwise
 * producer and consumer wire to different CF queues:
 * - Producer derivation in `generateWranglerConfig` (`queues.producers[].queue`)
 * - Consumer entry in `generateWranglerConfig` (`queues.consumers[].queue`)
 * - Switch case label in the generated `async queue(batch, env, ctx)` handler
 */
export function toCFQueueName(input: string): string {
  if (!input) return ''
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const BINDING_PATTERNS: Array<{ pattern: RegExp; type: BindingType }> = [
  { pattern: /env\.(KV\w*)/g, type: 'kv' },
  { pattern: /env\.(DB\w*)/g, type: 'd1' },
  { pattern: /env\.(BUCKET\w*)/g, type: 'r2' },
  { pattern: /env\.(QUEUE\w*)/g, type: 'queue' },
  { pattern: /env\.(AI(?:_\w+)?)(?=[.\s,;)\]}]|$)/g, type: 'ai' },
  { pattern: /env\.(VECTORIZE\w*)/g, type: 'vectorize' },
  { pattern: /env\.(ANALYTICS\w*)/g, type: 'analytics_engine' },
  { pattern: /env\.(HYPERDRIVE\w*)/g, type: 'hyperdrive' },
  { pattern: /env\.(BROWSER)/g, type: 'browser' },
  { pattern: /env\.(SERVICE\w*)/g, type: 'service' },
]

export function detectBindings(
  ir: WorkflowIR,
  envBindings?: Array<{ name: string; type: string }>,
): BindingRequirement[] {
  const seen = new Set<string>()
  const bindings: BindingRequirement[] = []

  function add(req: BindingRequirement) {
    const key = `${req.type}:${req.name}`
    if (seen.has(key)) return
    seen.add(key)
    bindings.push(req)
  }

  if (envBindings) {
    for (const b of envBindings) {
      add({ name: b.name, type: b.type as BindingType, source: 'env-binding' })
    }
  }

  for (const node of ir.nodes) {
    const codeStrings: string[] = []
    for (const v of Object.values(node.data)) {
      if (typeof v === 'string') codeStrings.push(v)
    }

    for (const code of codeStrings) {
      for (const { pattern, type } of BINDING_PATTERNS) {
        const regex = new RegExp(pattern.source, 'g')
        let match: RegExpExecArray | null
        while ((match = regex.exec(code)) !== null) {
          add({ name: match[1]!, type, source: 'code-scan', nodeId: node.id })
        }
      }
    }
  }

  return bindings
}

export function detectBindingsFromSource(source: string): BindingRequirement[] {
  const seen = new Set<string>()
  const bindings: BindingRequirement[] = []

  for (const { pattern, type } of BINDING_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g')
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      const key = `${type}:${match[1]!}`
      if (seen.has(key)) continue
      seen.add(key)
      bindings.push({ name: match[1]!, type, source: 'code-scan' })
    }
  }

  return bindings
}
