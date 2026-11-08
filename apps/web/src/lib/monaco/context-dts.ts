import type { Monaco } from '@monaco-editor/react'
import {
  computeVarNames,
  escapeJsdoc,
  outputSchemaToType,
  propertyKey,
  stripExportPrefix,
} from '@awaitstep/codegen'
import type { NodeDefinition, ResourceDeclaration } from '@awaitstep/ir'

export interface WorkflowTypeContextInput {
  kind: 'workflow' | 'script'
  nodes: { id: string; name: string; type: string }[]
  /** Declared env var names (values never reach the browser). */
  envVarNames: string[]
  bindings: ResourceDeclaration[]
  /** Set when the editor has loaded that provider's type pack. */
  providerTypes?: 'cloudflare' | null
  resolveDefinition: (nodeType: string) => NodeDefinition | undefined
}

const BINDING_TYPE_BY_KIND: Record<string, string> = {
  kv: 'KVNamespace',
  d1: 'D1Database',
  r2: 'R2Bucket',
  queue: 'Queue',
  service: 'ServiceBinding',
  workflow: 'Workflow',
}

function comment(text: string): string {
  return `/** ${escapeJsdoc(text)} */`
}

/**
 * The workflow-specific ambient d.ts: a typed Env from declared env vars and
 * resources, one typed const per node output (from the node definition's
 * outputSchema, `any` when a node declares none), and for scripts the
 * runGraph signature with its EXPORT_ outputs. Provider binding interfaces
 * are only named when that provider's type pack is loaded; otherwise every
 * resource is `any`, which keeps a neutral project callable.
 */
export function buildWorkflowContextDts(input: WorkflowTypeContextInput): string {
  const lines: string[] = ['// Generated per-workflow ambient types — do not edit.', '']

  const providerTypes = input.providerTypes ?? null
  lines.push('declare interface Env {')
  if (providerTypes === 'cloudflare') {
    lines.push('  /** The Cloudflare workflow binding generated for this canvas. */')
    lines.push('  WORKFLOW: Workflow;')
  }
  for (const name of input.envVarNames) {
    lines.push(`  ${propertyKey(name)}: string;`)
  }
  for (const binding of input.bindings) {
    // `any`, not `unknown`: kinds without a modeled interface (ai, vectorize,
    // hyperdrive, ...) must stay callable — with validation on, `unknown`
    // turns every method call into a TS2339 squiggle.
    const type =
      providerTypes === 'cloudflare' ? (BINDING_TYPE_BY_KIND[binding.kind] ?? 'any') : 'any'
    if (binding.resourceName) lines.push(`  ${comment(binding.resourceName)}`)
    lines.push(`  ${propertyKey(binding.name)}: ${type};`)
  }
  // Open `any` index signature: queue/sub-workflow bindings derived from
  // trigger annotations at generate time are not declared here, and both
  // their property access and their method calls must not read as type
  // errors (an `unknown` index would TS2339 every call).
  lines.push('  [binding: string]: any;')
  lines.push('}')
  lines.push('')
  lines.push('/** Environment bindings and variables for this workflow. */')
  lines.push('declare const env: Env;')
  lines.push('')

  const varNames = computeVarNames(input.nodes)
  for (const node of input.nodes) {
    const varName = varNames.get(node.id)
    if (!varName) continue
    const schema = input.resolveDefinition(node.type)?.outputSchema
    const type = schema && Object.keys(schema).length > 0 ? outputSchemaToType(schema) : 'any'
    lines.push(comment(`Output of node "${node.name}" (${node.type})`))
    lines.push(`declare const ${varName}: ${type};`)
  }

  if (input.kind === 'script') {
    const exports = input.nodes
      .filter((n) => n.name.startsWith('EXPORT_'))
      .map((n) => {
        const schema = input.resolveDefinition(n.type)?.outputSchema
        const type =
          schema && Object.keys(schema).length > 0 ? outputSchemaToType(schema, '  ') : 'any'
        return `  ${propertyKey(stripExportPrefix(n.name))}: ${type};`
      })
    lines.push('')
    lines.push('/** Runs the canvas graph; EXPORT_-named node outputs surface on the result. */')
    lines.push('declare function runGraph(env: Env, event?: unknown): Promise<{')
    lines.push(...exports)
    lines.push('}>;')
  }

  return lines.join('\n') + '\n'
}

const WORKFLOW_CONTEXT_LIB_URI = 'file:///awaitstep/workflow-context.d.ts'

let last: { monaco: Monaco; dts: string } | undefined

/**
 * Installs (or replaces) the per-workflow ambient lib. Content-compared so
 * canvas interactions that don't change the type surface (drags, renames of
 * unrelated fields) never churn the TypeScript worker.
 */
export function setWorkflowTypeContext(monaco: Monaco, dts: string): void {
  if (last && last.monaco === monaco && last.dts === dts) return
  last = { monaco, dts }
  const ts = monaco.languages.typescript
  ts.typescriptDefaults.addExtraLib(dts, WORKFLOW_CONTEXT_LIB_URI)
  ts.javascriptDefaults.addExtraLib(dts, WORKFLOW_CONTEXT_LIB_URI)
}

/** Test/workspace reset: the next context is written even if it is identical. */
export function resetWorkflowTypeContext(): void {
  last = undefined
}
