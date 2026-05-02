import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import {
  topologicalSort,
  buildVarNameMap,
  setVarNameMap,
  clearVarNameMap,
  varName,
  indent,
  isExportedName,
} from '@awaitstep/codegen'
import { collectBranchInlineTargets } from './generators/branch.js'
import { generateCustomNodeParts } from './generators/custom.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { detectBindings } from './bindings.js'
import {
  CF_ENV_TYPE,
  collapseBlankLines,
  endsWithReturn,
  extractImports,
  generateNodeCode,
  resolveNodeExpressions,
} from './generate-helpers.js'
import { parseAnnotations } from './parse-annotations.js'

/**
 * Default trigger-code scaffold for new scripts. Uses the annotated multi-handler
 * form: `@fetch function handler(...)` for the HTTP entry point, with a comment
 * showing how to add `@queue function NAME(...)` handlers.
 *
 * Top-level code outside annotated functions becomes module scope (imports,
 * shared helpers). The graph nodes run inside `runGraph(env, event)` (auto-
 * generated, isolated); the @fetch handler decides what to do with their
 * outputs. Users can replace this code via the script's `triggerCode` field —
 * the runGraph call and `graph.*` outputs stay stable across edits.
 */
export const DEFAULT_SCRIPT_TRIGGER_CODE = `// import packages here

@fetch function handler(request, env, ctx) {
  try {
    if (request.method !== "POST") {
      return new Response(null, { status: 200 });
    }
    const params = await request.json().catch(() => undefined);
    const event = { payload: params };

    const graph = await runGraph(env, event);

    // ▼ everything below is yours — change the response, add error
    // handling, branch on request shape, etc. Available outputs are on
    // \`graph.*\` (one entry per step that returns a value).
    return Response.json(graph);
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}

// Add queue handlers below using:
// @queue function NAME(batch, env, ctx) { ... }
`

export interface GenerateScriptOptions {
  templateResolver?: TemplateResolver
  envVarNames?: string[]
  preview?: boolean
  /**
   * User-edited replacement for the default fetch handler body. When set,
   * this code is emitted verbatim inside `async fetch(request, env)`. The
   * auto-generated `runGraph(env, event)` function and `graph.*` outputs
   * remain available; user code typically calls `runGraph` and decides what
   * to return.
   */
  triggerCode?: string
}

export function generateScript(
  ir: ScriptIR,
  templateResolverOrOptions?: TemplateResolver | GenerateScriptOptions,
): string {
  const opts: GenerateScriptOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, preview, triggerCode } = opts

  // Reuse the workflow-shaped helpers — the IR fields they read (nodes, edges,
  // entryNodeId, metadata) are identical between WorkflowIR and ScriptIR. The
  // only structural difference is the literal `kind`.
  const irAsWorkflow = ir as unknown as WorkflowIR
  const sorted = topologicalSort(irAsWorkflow)
  const nameMap = buildVarNameMap(ir.nodes)
  setVarNameMap(nameMap)
  const useStateTracking = hasTemplateExpressions(ir.nodes)

  const inlineTargets = collectBranchInlineTargets(irAsWorkflow)

  const resolvedIR: ScriptIR = useStateTracking
    ? { ...ir, nodes: ir.nodes.map(resolveNodeExpressions) }
    : ir

  const bodyParts: string[] = []
  const classDefinitions = new Map<string, string>()

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n: WorkflowNode) => [n.id, n]))
  const resolvedSorted = sorted.map((n: WorkflowNode) => resolvedNodeMap.get(n.id) ?? n)

  // Script-incompatible node types (sleep, sleep_until, wait_for_event) are
  // rejected upstream by validateScript, so they never reach this set.
  const builtinTypes = new Set([
    'step',
    'branch',
    'parallel',
    'http_request',
    'try_catch',
    'loop',
    'break',
    'sub_workflow',
    'sub_script',
    'race',
  ])

  for (const node of resolvedSorted) {
    if (inlineTargets.has(node.id)) continue

    if (!builtinTypes.has(node.type) && templateResolver) {
      const template = templateResolver.getTemplate(node.type, node.provider)
      if (template) {
        const parts = generateCustomNodeParts(node, template, 'script')
        if (!classDefinitions.has(parts.className)) {
          classDefinitions.set(parts.className, parts.classDefinition)
        }
        bodyParts.push(parts.imports.join('\n') + '\n' + parts.stepCode)
        continue
      }
    }

    const code = generateNodeCode(
      node,
      resolvedIR as unknown as WorkflowIR,
      templateResolver,
      classDefinitions,
      'script',
    )
    bodyParts.push(code)
  }

  const collectedImports: string[] = []
  const strippedParts = bodyParts.map((part) => {
    const { imports, body } = extractImports(part)
    collectedImports.push(...imports)
    return body
  })

  // No `env. → this.env.` rewrite — scripts run in a fetch handler where
  // `env` is a parameter, not a class field.
  let graphBody = strippedParts.join('\n\n')

  // Opt-in graph export: a node whose display name starts with `EXPORT_`
  // surfaces on `graph.X` (the prefix is already stripped from its varName).
  // Three cases per emitted `const X = await ...`:
  //   1. Exported, top-level: keep `const X = ...` (already in scope of return).
  //   2. Exported, nested in a container: hoist with `let X;` + rewrite the
  //      decl to `X = ...` so the value escapes the block.
  //   3. Not exported, not referenced anywhere else: drop the assignment so
  //      the call becomes a bare `await ...;`.
  //   4. Not exported, referenced elsewhere: keep `const X = ...` (downstream
  //      nodes need the var) but don't include in return.
  // Must run before `clearVarNameMap` so `varName(node.id)` resolves to the
  // same name the per-node generators emitted.
  const exportedVarNames: string[] = []
  const hoistedVarNames: string[] = []
  for (const node of resolvedIR.nodes) {
    const v = varName(node.id)
    const declRe = new RegExp(`^(\\s*)const ${v}\\s*=`, 'm')
    const m = declRe.exec(graphBody)
    if (!m) continue

    const exported = isExportedName(node.name)
    const isNested = m[1].length > 0
    const refMatches = [...graphBody.matchAll(new RegExp(`\\b${v}\\b`, 'g'))]
    const isReferencedElsewhere = refMatches.length > 1

    if (exported) {
      exportedVarNames.push(v)
      if (isNested) {
        hoistedVarNames.push(v)
        graphBody = graphBody.replace(new RegExp(`\\bconst ${v}\\s*=`, 'g'), `${v} =`)
      }
    } else if (!isReferencedElsewhere) {
      // Drop the `const X = ` prefix only when the RHS starts with `await ` —
      // the resulting bare `await ...;` is a valid statement. For non-await
      // RHS (e.g. an object literal), leave the const as-is rather than
      // produce garbage like `{ ... };` at statement position.
      const guardedRe = new RegExp(`\\bconst ${v}\\s*=\\s*(await\\b)`, 'g')
      graphBody = graphBody.replace(guardedRe, '$1')
    }
  }
  clearVarNameMap()

  const allEnvNames = new Set(envVarNames ?? [])
  const envRefPattern = /\{\{env\.([A-Z][A-Z0-9_]*)\}\}/g
  for (const node of ir.nodes) {
    for (const value of Object.values(node.data)) {
      if (typeof value === 'string') {
        for (const m of value.matchAll(envRefPattern)) {
          allEnvNames.add(m[1])
        }
      }
    }
  }
  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const classDef of classDefinitions.values()) {
    for (const m of classDef.matchAll(envVarPattern)) {
      allEnvNames.add(m[1])
    }
  }

  // Scripts have no `WORKFLOW` self-binding (they aren't a Workflow). Only
  // sub-workflow bindings (calls into other deployed workflows) and resource
  // bindings (KV/D1/etc).
  const envFields: string[] = []
  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const b of subWorkflowBindings) {
    envFields.push(`  ${b.binding}: Workflow;`)
  }

  const detectedBindings = detectBindings(ir as unknown as WorkflowIR)
  const bindingNames = new Set<string>()
  for (const b of detectedBindings) {
    const cfType = CF_ENV_TYPE[b.type]
    if (cfType) {
      envFields.push(`  ${b.name}: ${cfType};`)
      bindingNames.add(b.name)
    }
  }
  for (const name of allEnvNames) {
    if (!bindingNames.has(name)) {
      envFields.push(`  ${name}: string;`)
    }
  }

  const rawTriggerCode =
    triggerCode && triggerCode.length > 0 ? triggerCode : DEFAULT_SCRIPT_TRIGGER_CODE

  const parsed = parseAnnotations(rawTriggerCode)

  // Per-block import extraction. In legacy mode there's only one block (the
  // fetch body). In strict mode we extract imports from module-level code,
  // the @fetch handler body, and every @queue handler body — all imports get
  // hoisted to the top of the generated worker.
  let moduleCode = ''
  let fetchHandlerEmission: { params: string; body: string } | null = null
  const queueHandlerEmissions: Array<{
    /** JS function identifier (used for code-gen comments only). */
    name: string
    /** CF-valid queue name (used as the switch case label). */
    queueName: string
    params: string
    body: string
  }> = []

  if (parsed.mode === 'legacy') {
    const { imports, body } = extractImports(parsed.fetchBody)
    collectedImports.push(...imports)
    fetchHandlerEmission = { params: 'request: Request, env: Env', body }
  } else {
    if (parsed.moduleCode.trim().length > 0) {
      const { imports, body } = extractImports(parsed.moduleCode)
      collectedImports.push(...imports)
      moduleCode = body
    }
    if (parsed.fetchHandler) {
      const { imports, body } = extractImports(parsed.fetchHandler.body)
      collectedImports.push(...imports)
      fetchHandlerEmission = { params: parsed.fetchHandler.params, body }
    }
    for (const qh of parsed.queueHandlers) {
      const { imports, body } = extractImports(qh.body)
      collectedImports.push(...imports)
      queueHandlerEmissions.push({
        name: qh.name,
        queueName: qh.queueName ?? qh.name,
        params: qh.params,
        body,
      })
    }
  }

  // runGraph isolates node-emitted code in its own function. Only nodes
  // marked for export (display name prefixed with `EXPORT_`) surface on
  // `graph.X`. Hoisted vars (exported nodes living inside container blocks)
  // are declared via `let` at the top so the assignment can escape the block.
  const declStatement = hoistedVarNames.length > 0 ? `  let ${hoistedVarNames.join(', ')};\n` : ''
  const bodyAlreadyReturns = endsWithReturn(graphBody)
  const returnStatement = bodyAlreadyReturns
    ? ''
    : exportedVarNames.length > 0
      ? `  return { ${exportedVarNames.join(', ')} };`
      : '  return {};'
  const runGraphBody =
    graphBody.trim().length > 0 ? indent(graphBody, 2) + (bodyAlreadyReturns ? '' : '\n') : ''
  const runGraphBlock = `async function runGraph(env: Env, event: { payload: unknown }) {
${declStatement}${runGraphBody}${returnStatement}
}`

  const uniqueImports = [...new Set(collectedImports)]
  const importBlock = uniqueImports.length > 0 ? '\n' + uniqueImports.join('\n') : ''
  const classBlock =
    !preview && classDefinitions.size > 0
      ? '\n' + [...classDefinitions.values()].join('\n\n') + '\n'
      : ''
  const cleanedModuleCode = collapseBlankLines(moduleCode).trim()
  const moduleCodeBlock = cleanedModuleCode.length > 0 ? '\n' + cleanedModuleCode + '\n' : ''
  const envBlock = envFields.length > 0 ? `\n${envFields.join('\n')}\n` : ''

  // Build the export default object — fetch handler is omitted entirely for
  // queue-only workers; queue handler is omitted when no @queue annotations.
  const handlerBlocks: string[] = []
  if (fetchHandlerEmission) {
    handlerBlocks.push(`  async fetch(${fetchHandlerEmission.params}): Promise<Response> {
${indent(fetchHandlerEmission.body, 4)}
  },`)
  }
  if (queueHandlerEmissions.length > 0) {
    const cases = queueHandlerEmissions
      .map((qh) => {
        const trailing = endsWithReturn(qh.body) ? '' : '\n        return'
        return `      case "${qh.queueName}": {
${indent(qh.body, 8)}${trailing}
      }`
      })
      .join('\n')
    handlerBlocks.push(`  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (batch.queue) {
${cases}
    }
  },`)
  }
  const exportDefault = `export default {
${handlerBlocks.join('\n')}
};`

  return `${importBlock ? importBlock.trimStart() + '\n\n' : ''}interface Env {${envBlock}}
${classBlock}${moduleCodeBlock}
${runGraphBlock}

${exportDefault}
`
}
