import type { Monaco } from '@monaco-editor/react'
import {
  computeVarNames,
  escapeJsdoc,
  outputSchemaToType,
  propertyKey,
  stripExportPrefix,
} from '@awaitstep/codegen'
import type { BindingDeclaration, NodeDefinition } from '@awaitstep/ir'

export interface WorkflowTypeContextInput {
  kind: 'workflow' | 'script'
  nodes: { id: string; name: string; type: string }[]
  /** Declared env var names (values never reach the browser). */
  envVarNames: string[]
  bindings: BindingDeclaration[]
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
 * The workflow-specific ambient d.ts layered over the static Cloudflare
 * runtime types: a typed Env from declared env vars + bindings, one typed
 * const per node output (from the node definition's outputSchema, `any`
 * when a node declares none), and for scripts the runGraph signature with
 * its EXPORT_ outputs. Replaces v1's untyped `declare const env` and gives
 * node code editors hover/completions for upstream results.
 */
export function buildWorkflowContextDts(input: WorkflowTypeContextInput): string {
  const lines: string[] = ['// Generated per-workflow ambient types — do not edit.', '']

  lines.push('declare interface Env {')
  lines.push('  /** The workflow binding generated for this canvas. */')
  lines.push('  WORKFLOW: Workflow;')
  for (const name of input.envVarNames) {
    lines.push(`  ${propertyKey(name)}: string;`)
  }
  for (const binding of input.bindings) {
    // `any`, not `unknown`: kinds without a modeled interface (ai, vectorize,
    // hyperdrive, ...) must stay callable — with validation on, `unknown`
    // turns every method call into a TS2339 squiggle.
    const type = BINDING_TYPE_BY_KIND[binding.type] ?? 'any'
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

let lastDts: string | undefined

/**
 * Installs (or replaces) the per-workflow ambient lib. Content-compared so
 * canvas interactions that don't change the type surface (drags, renames of
 * unrelated fields) never churn the TypeScript worker.
 */
export function setWorkflowTypeContext(monaco: Monaco, dts: string): void {
  if (dts === lastDts) return
  lastDts = dts
  const ts = monaco.languages.typescript
  ts.typescriptDefaults.addExtraLib(dts, WORKFLOW_CONTEXT_LIB_URI)
  ts.javascriptDefaults.addExtraLib(dts, WORKFLOW_CONTEXT_LIB_URI)
}
