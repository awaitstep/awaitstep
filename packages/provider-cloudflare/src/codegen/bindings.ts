import type { ArtifactIR, ValidationError, WorkflowIR } from '@awaitstep/ir'
import { workerNameToBinding } from './generators/sub-script.js'

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
  source: 'declaration' | 'env-binding' | 'code-scan'
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
  // Declared bindings (ir.runtime.bindings) are authoritative: the workflow
  // says exactly what it uses and carries resource ids in the declaration —
  // no regex inference, no <NAME>_BINDING_ID env smuggling. The scan below
  // remains the legacy fallback for IRs that predate declarations.
  const declared = ir.runtime?.bindings
  if (declared && declared.length > 0) {
    const seen = new Set<string>()
    const out: BindingRequirement[] = []
    for (const d of declared) {
      const key = `${d.type}:${d.name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        name: d.name,
        type: d.type as BindingType,
        source: 'declaration',
        ...(d.resourceId !== undefined && { resourceId: d.resourceId }),
      })
    }
    return out
  }

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

const BINDING_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const KNOWN_BINDING_TYPES = new Set<string>([
  'kv',
  'd1',
  'r2',
  'queue',
  'secret',
  'variable',
  'service',
  'ai',
  'vectorize',
  'analytics_engine',
  'hyperdrive',
  'browser',
])

/**
 * Validates runtime binding declarations against Cloudflare's rules: names
 * must be valid identifiers (they become fields on the Worker Env) and types
 * must be kinds this provider can provision. Declarations are new surface, so
 * strict validation here cannot reject any stored legacy workflow.
 */
export function validateSubScriptBindings(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []
  const claimed = new Map<string, { nodeName: string; workerName: string }>()

  for (const node of ir.nodes) {
    if (node.type !== 'sub_script') continue
    const workerName = String(node.data.workerName ?? '')
    const binding = workerNameToBinding(workerName)

    if (!binding) {
      errors.push({
        path: `nodes.${node.id}.data.workerName`,
        message: workerName.trim()
          ? `Call Script node "${node.name}" cannot use worker "${workerName}": the name has no letters or digits to build an Env binding from`
          : `Call Script node "${node.name}" has no worker selected`,
        nodeId: node.id,
      })
      continue
    }

    const prior = claimed.get(binding)
    if (prior && prior.workerName !== workerName) {
      // Both nodes would read `env.<binding>`, but only one service binding is
      // emitted — one of them would silently call the other's worker.
      errors.push({
        path: `nodes.${node.id}.data.workerName`,
        message: `Call Script nodes "${prior.nodeName}" and "${node.name}" both map to the Env binding "${binding}" ("${prior.workerName}" and "${workerName}") — rename one of the workers`,
        nodeId: node.id,
      })
      continue
    }
    claimed.set(binding, { nodeName: node.name, workerName })
  }

  return errors
}

export function validateBindingDeclarations(ir: WorkflowIR): ValidationError[] {
  const errors: ValidationError[] = []
  for (const declaration of ir.runtime?.bindings ?? []) {
    if (!BINDING_NAME_PATTERN.test(declaration.name)) {
      errors.push({
        path: 'runtime.bindings',
        message: `Binding name "${declaration.name}" must be a valid identifier (letters, digits, underscores; not starting with a digit)`,
      })
    }
    if (!KNOWN_BINDING_TYPES.has(declaration.type)) {
      errors.push({
        path: 'runtime.bindings',
        message: `Binding "${declaration.name}" has unknown type "${declaration.type}" — supported: ${[...KNOWN_BINDING_TYPES].join(', ')}`,
      })
    }
  }
  return errors
}
