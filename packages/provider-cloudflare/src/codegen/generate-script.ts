import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { hasHandlerModules, projectHandlerModules } from '@awaitstep/ir'
import type {
  StepManifestEntry,
  GeneratedBundle,
  GeneratedFile,
  GeneratorLookup,
  StepManifest,
  TemplateResolver,
} from '@awaitstep/codegen'
import { handlerDelegates, handlerWiring } from './handler-modules.js'
import { boundVarNames, exportPlan } from './export-plan.js'
import { graphModuleNames } from './graph-module-names.js'
import { assertStepPathsFree, moduleImportLine, modulePathOf } from './module-files.js'
import {
  CORE_RUNTIME_IMPORT,
  computeVarNames,
  contentHash,
  createGenerationContext,
  importSpecifiers,
  indent,
  upstreamVarNames,
  normalizeStepModules,
  projectBundleFiles,
  stepLabel,
  topologicalSort,
  validateBundle,
  withoutComments,
} from '@awaitstep/codegen'
import {
  CLOUDFLARE_PRIMITIVES_IMPORT,
  FUNCTION_RUNTIME_IMPORT,
  cloudflarePrimitivesModuleFile,
  runtimeModuleFile,
} from './runtime-module.js'
import { collectBranchInlineTargets } from './generators/branch.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { getSubScriptBindings } from './generators/sub-script.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { detectBindings } from './bindings.js'
import { retentionLiteral, type CloudflareRetention } from './retention.js'
import {
  CF_ENV_TYPE,
  collapseBlankLines,
  endsWithReturn,
  extractImports,
  collectEnvRefNames,
  detectKind,
  envFieldName,
  generateNodeCode,
  resolveNodeExpressions,
  wrapModuleCalls,
} from './generate-helpers.js'
import { parseAnnotations } from './parse-annotations.js'

/**
 * Default trigger-code scaffold for new scripts, in the annotated form:
 * `@fetch function handler(...)` for the HTTP entry point. Queue and cron
 * handlers are project files under `handlers/` now, so the scaffold no longer
 * advertises `@queue` annotations.
 *
 * Top-level code outside annotated functions becomes module scope (imports,
 * shared helpers). The graph nodes run inside `runGraph(env, event)` (auto-
 * generated, isolated); the @fetch handler decides what to do with their
 * outputs. Users can replace this code via the script's `triggerCode` field —
 * the runGraph call and `graph.*` outputs stay stable across edits.
 */
/** The generated graph module of a function: `runGraph`, its `Env`, its classes. */
export const FUNCTION_MODULE_PATH = 'awaitstep/function.ts'

export const DEFAULT_SCRIPT_TRIGGER_CODE = `
@fetch function handler(request: Request, env: Env) {
  try {
    if (request.method !== "POST") {
      return new Response(null, { status: 200 });
    }
    const params = await request.json().catch(() => undefined);
    const event = { payload: params };

    const graph = await runGraph(env, event);

    return Response.json(graph);
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}
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
  /**
   * Instance retention for sub-workflow creates. Scripts only emit the
   * `AWAITSTEP_RETENTION` const when the IR contains a sub_workflow node.
   */
  retention?: CloudflareRetention
  /** Generator lookup for node dispatch; defaults to the Cloudflare builtins. */
  generators?: GeneratorLookup
}

/** The worker's source alone, for previews and tests; {@link generateScriptBundle} is the deployable form. */
export function generateScript(
  ir: ScriptIR,
  templateResolverOrOptions?: TemplateResolver | GenerateScriptOptions,
): string {
  return generateScriptInternal(ir, templateResolverOrOptions).source
}

/**
 * Bundle generation for a function: the fetch-only `worker.ts` entry, one
 * `nodes/<var>.ts` module per step (the same shape a workflow's steps have),
 * the runtime module `runGraph` imports, and the project files. Steps run
 * through the in-request host, so the step manifest names each one.
 */
export function generateScriptBundle(
  ir: ScriptIR,
  templateResolverOrOptions?: TemplateResolver | GenerateScriptOptions,
): GeneratedBundle {
  assertStepPathsFree(ir)
  const { source, files, manifest } = generateScriptInternal(ir, templateResolverOrOptions)
  const projectFiles = projectBundleFiles(ir.runtime?.files)
  // Emit a runtime module only when something shipped imports it — generated
  // code, a step module, or a project file — so a function with no steps
  // stays the single file it always was.
  const imported = new Set(
    [
      source,
      ...files.map((file) => file.source),
      ...projectFiles.map((file) => file.source),
    ].flatMap((candidate) => importSpecifiers(withoutComments(candidate))),
  )
  const extra: GeneratedFile[] = []
  if (imported.has(CORE_RUNTIME_IMPORT)) extra.push(runtimeModuleFile())
  if (
    [...imported].some(
      (specifier) =>
        specifier === CLOUDFLARE_PRIMITIVES_IMPORT ||
        specifier.startsWith(`${CLOUDFLARE_PRIMITIVES_IMPORT}/`),
    )
  ) {
    extra.push(cloudflarePrimitivesModuleFile())
  }
  return {
    ...validateBundle({
      entry: 'worker.ts',
      files: [{ path: 'worker.ts', source, role: 'entry' }, ...files, ...extra, ...projectFiles],
    }),
    manifest,
  }
}

/** A node a function returns, and the key its value comes back under. */
export interface ExportPlanEntry {
  nodeId: string
  varName: string
  key: string
}

function generateScriptInternal(
  ir: ScriptIR,
  templateResolverOrOptions?: TemplateResolver | GenerateScriptOptions,
): { source: string; files: GeneratedFile[]; manifest: StepManifest } {
  const opts: GenerateScriptOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, preview, triggerCode, retention, generators } = opts

  // Every step's code in module form, whatever shape was stored.
  ir = normalizeStepModules(ir)
  // Reuse the workflow-shaped helpers — the IR fields they read (nodes, edges,
  // entryNodeId, metadata) are identical between WorkflowIR and ScriptIR. The
  // only structural difference is the literal `kind`.
  const irAsWorkflow = ir as unknown as WorkflowIR
  const sorted = topologicalSort(irAsWorkflow)
  // Steps become modules, as in a workflow: each receives the upstream vars
  // its body names as `inputs`, which the entry destructures at the call.
  // A returned child of a container is hoisted to the top, so it reaches
  // what follows the container; a plain child stays in its block.
  const names = computeVarNames(ir.nodes)
  const plan = exportPlan(irAsWorkflow)
  const upstream = upstreamVarNames(irAsWorkflow, boundVarNames(ir, names), (node) =>
    plan.has(node.id),
  )
  const ctx = createGenerationContext(ir.nodes, { emitModules: true, upstream })
  const useStateTracking = hasTemplateExpressions(ir.nodes)

  const inlineTargets = collectBranchInlineTargets(irAsWorkflow)

  // The modules were normalised above; a `{{ a.ok }}` inside one resolves
  // to `inputs.A.ok`, which the call site then binds.
  const resolvedIR: ScriptIR = useStateTracking
    ? { ...ir, nodes: ir.nodes.map((n) => resolveNodeExpressions(n, (id) => ctx.varName(id))) }
    : ir

  const bodyParts: string[] = []
  /** The top-level node each part of the body was emitted for, in order. */
  const emittedNodes: WorkflowNode[] = []
  const classDefinitions = new Map<string, string>()

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n: WorkflowNode) => [n.id, n]))
  const resolvedSorted = sorted.map((n: WorkflowNode) => resolvedNodeMap.get(n.id) ?? n)

  // Script-incompatible node types (sleep, sleep_until, wait_for_event) are
  // rejected upstream by validateScript, so they never reach codegen. Custom
  // (non-registry) types fall through generateNodeCode's dispatch to the
  // template path — one authority for what counts as builtin.
  for (const node of resolvedSorted) {
    if (inlineTargets.has(node.id)) continue

    const code = generateNodeCode(
      node,
      resolvedIR as unknown as WorkflowIR,
      ctx,
      templateResolver,
      classDefinitions,
      'script',
      generators,
    )
    bodyParts.push(code)
    emittedNodes.push(node)
  }

  // Imports the graph's own code asked for (an inline step's, a template's)
  // go with the graph into `awaitstep/function.ts`; the trigger code's go
  // with the handlers into `worker.ts`.
  const graphImports: string[] = []
  const collectedImports: string[] = []
  const strippedParts = bodyParts.map((part) => {
    const { imports, body } = extractImports(part)
    graphImports.push(...imports)
    return body
  })

  // No `env. → this.env.` rewrite — scripts run in a fetch handler where
  // `env` is a parameter, not a class field.
  let graphBody = strippedParts.join('\n\n')

  // Opt-in graph export: a node whose data says `export: true` (the canvas's
  // "Return this value" switch) — or, the legacy way, whose display name
  // starts with `EXPORT_` (the prefix is already stripped from its varName) —
  // surfaces on `graph.<key>`; the key is its `exportAs` or its var name.
  // Three cases per emitted `const X = await ...`:
  //   1. Exported, top-level: keep `const X = ...` (already in scope of return).
  //   2. Exported, nested in a container: hoist with `let X;` + rewrite the
  //      decl to `X = ...` so the value escapes the block.
  //   3. Not exported, not referenced anywhere else: drop the assignment so
  //      the call becomes a bare `await ...;`.
  //   4. Not exported, referenced elsewhere: keep `const X = ...` (downstream
  //      nodes need the var) but don't include in return.
  //
  // Which nodes are returned, and under which keys, is `exportPlan`'s call
  // (result-producer kinds always; the canvas reads the same plan). Here the
  // plan meets the emitted text: a node is returned only when its `const`
  // was emitted, in emission order.
  const exportKeys = new Map<string, string>()
  const hoistedVarNames: string[] = []
  for (const node of resolvedSorted) {
    const v = ctx.varName(node.id)
    // Indentation means "inside a container". Horizontal whitespace only:
    // `\s*` would swallow the blank line between two top-level parts and
    // hoist every top-level export after the first.
    const declRe = new RegExp(`^([ \\t]*)const ${v}\\s*=`, 'm')
    const m = declRe.exec(graphBody)
    if (!m) continue

    const planned = plan.get(node.id)
    const isNested = m[1].length > 0
    // A reference is the bare identifier: not the step's own label in
    // `flow.step("name"`, not the `$name` module import at its call.
    const refMatches = [...graphBody.matchAll(new RegExp(`(?<![$"'])\\b${v}\\b(?!["'])`, 'g'))]
    const isReferencedElsewhere = refMatches.length > 1

    if (planned) {
      exportKeys.set(v, planned.key)
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

  const allEnvNames = new Set(envVarNames ?? [])
  for (const name of collectEnvRefNames(ir.nodes)) {
    allEnvNames.add(name)
  }
  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const classDef of classDefinitions.values()) {
    for (const m of classDef.matchAll(envVarPattern)) {
      allEnvNames.add(m[1])
    }
  }

  // Scripts have no `WORKFLOW` self-binding (they aren't a Workflow). Only
  // sub-workflow bindings (calls into other deployed workflows), service
  // bindings (calls into other Functions) and resource bindings (KV/D1/etc).
  const envFields: string[] = []
  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const b of subWorkflowBindings) {
    envFields.push(`  ${envFieldName(b.binding)}: Workflow;`)
  }
  const subScriptBindings = getSubScriptBindings(ir.nodes)
  for (const b of subScriptBindings) {
    envFields.push(`  ${envFieldName(b.binding)}: Fetcher;`)
  }
  const structuralBindings = new Set([
    ...subWorkflowBindings.map((b) => b.binding),
    ...subScriptBindings.map((b) => b.binding),
  ])

  const detectedBindings = detectBindings(ir as unknown as WorkflowIR)
  const bindingNames = new Set<string>(structuralBindings)
  for (const b of detectedBindings) {
    if (structuralBindings.has(b.name)) continue
    const cfType = CF_ENV_TYPE[b.type]
    if (cfType) {
      envFields.push(`  ${envFieldName(b.name)}: ${cfType};`)
      bindingNames.add(b.name)
    }
  }
  for (const name of allEnvNames) {
    if (!bindingNames.has(name)) {
      envFields.push(`  ${envFieldName(name)}: string;`)
    }
  }

  // Handler modules (handlers/**) replace the annotation file outright; the
  // default scaffold only supplies the fetch entry when no module does.
  const modules = projectHandlerModules(ir.runtime?.files)
  const wiring = hasHandlerModules(modules) ? handlerWiring(modules) : null
  const rawTriggerCode =
    !wiring && triggerCode && triggerCode.length > 0 ? triggerCode : DEFAULT_SCRIPT_TRIGGER_CODE

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

  if (wiring) {
    collectedImports.push(...wiring.imports)
    if (wiring.fetch) fetchHandlerEmission = null
  }

  // runGraph isolates node-emitted code in its own function. Only nodes
  // marked for export (the `export` flag, or the legacy `EXPORT_` name
  // prefix) surface on `graph.<key>`. Hoisted vars (exported nodes living inside container blocks)
  // are declared via `let` at the top so the assignment can escape the block.
  // With handler modules it is exported so handlers/fetch.ts can import it.
  const declStatement = hoistedVarNames.length > 0 ? `  let ${hoistedVarNames.join(', ')};\n` : ''
  // The graph runs on the in-request host: `flow.step` runs each step body
  // here and now, with the node's retries and timeout, and `step` is the
  // adapter the step modules receive — the same two names a workflow's
  // `run` establishes, so a step module is the same file in both kinds.
  graphBody = wrapModuleCalls(graphBody, 2)
  // The context is needed when a step runs here — a module, a container
  // child's inline `flow.step`, or a hand-written `step.do` — never for a
  // comment or an inline body's own `step` identifier.
  const usesFlow =
    ctx.files.some((file) => file.role === 'module') ||
    /\b(?:flow\.(?:step|sleep|sleepUntil|waitForEvent)|step\.(?:do|sleep|sleepUntil|waitForEvent))\(/.test(
      withoutComments(graphBody),
    )
  // A function's invocation is a run of its own: the context's event carries
  // a timestamp and an instance id beside the request's payload.
  const contextLines = usesFlow
    ? [
        '  const flow = createWorkflowContext({',
        '    env,',
        '    event: {',
        '      payload: event.payload,',
        '      timestamp: new Date(),',
        '      instanceId: globalThis.crypto.randomUUID(),',
        '    },',
        '    host: createInlineHost(),',
        '  });',
        '  const step = durableStep(flow);',
        '',
      ].join('\n')
    : ''
  const bodyAlreadyReturns = endsWithReturn(graphBody)
  const returnStatement = bodyAlreadyReturns
    ? ''
    : exportKeys.size > 0
      ? `  return { ${[...exportKeys].map(([v, key]) => (key === v ? v : `${key}: ${v}`)).join(', ')} };`
      : '  return {};'
  const runGraphBody =
    graphBody.trim().length > 0 ? indent(graphBody, 2) + (bodyAlreadyReturns ? '' : '\n') : ''
  const runGraphBlock = `export async function runGraph(env: Env, event: { payload: unknown }) {
${contextLines}${declStatement}${runGraphBody}${returnStatement}
}`

  // The entry imports the runtime and every step module it calls; `.js`
  // specifiers, since the deploy pipeline compiles the modules to .js paths.
  const moduleImports: string[] = []
  for (const moduleFile of ctx.files) {
    if (moduleFile.role !== 'module') continue
    moduleImports.push(moduleImportLine(moduleFile, '../'))
  }
  // The graph module imports the runtime and the step modules; the worker
  // imports the graph module, the handler modules and what the trigger code
  // asked for. Nothing imports the worker.
  const functionImports = [
    ...new Set([...(usesFlow ? [FUNCTION_RUNTIME_IMPORT] : []), ...moduleImports, ...graphImports]),
  ]
  const importBlock = functionImports.length > 0 ? '\n' + functionImports.join('\n') : ''
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
  if (wiring) handlerBlocks.push(...handlerDelegates(wiring))
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
};${wiring && wiring.reexports.length > 0 ? `\n\n${wiring.reexports.join('\n')}` : ''}`

  // Sub-workflow creates reference AWAITSTEP_RETENTION; only emit the const
  // when a sub_workflow node exists so plain scripts stay unchanged.
  const retentionBlock = ir.nodes.some((n) => n.type === 'sub_workflow')
    ? `\nexport const AWAITSTEP_RETENTION = ${retentionLiteral(retention)};\n`
    : ''

  // `awaitstep/function.ts`: the graph, its Env and the classes it calls.
  const functionSource = `${importBlock ? importBlock.trimStart() + '\n\n' : ''}export interface Env {${envBlock}}
${retentionBlock}${classBlock}
${runGraphBlock}
`
  // `worker.ts`: the Cloudflare bootstrap. Nothing imports it; it imports
  // from the graph module only what its own code calls (the inline default
  // fetch, or legacy trigger code, runs the graph).
  const workerBody = `${moduleCodeBlock}\n${exportDefault}`
  const graphNames = graphModuleNames(workerBody, ['runGraph', 'AWAITSTEP_RETENTION'])
  const workerImports = [
    ...new Set([
      `import { ${[...graphNames, 'type Env'].join(', ')} } from "./awaitstep/function.js";`,
      ...collectedImports,
    ]),
  ]
  const source = `${workerImports.join('\n')}
${workerBody}
`

  // One manifest entry per top-level node, as a workflow's: the step name and
  // kind when the emitted text carries the label on a primitive, the module
  // path when the step got its own file.
  // A step inside a container is a module too, run under its own id as
  // label inside the container's block.
  const topLevelIds = new Set(emittedNodes.map((node) => node.id))
  const nestedSteps: StepManifestEntry[] = resolvedSorted
    .filter((node) => node.type === 'step' && !topLevelIds.has(node.id))
    .flatMap((node) => {
      const varName = ctx.varName(node.id)
      const modulePath = modulePathOf(ctx.files, node, varName)
      if (modulePath === null) return []
      const exportKey = bodyAlreadyReturns ? undefined : exportKeys.get(varName)
      // The label is claimed only when the emitted text carries it on a primitive.
      const label = stepLabel(node)
      const labeled = graphBody.includes(`flow.step("${label}"`)
      return [
        {
          nodeId: node.id,
          ...(labeled && { stepName: label, kind: 'do' as const }),
          varName,
          filePath: modulePath,
          ...(exportKey !== undefined && { exportKey }),
        },
      ]
    })
  const manifest: StepManifest = {
    irHash: contentHash(JSON.stringify(ir)),
    steps: emittedNodes.map((node, i) => {
      const varName = ctx.varName(node.id)
      const modulePath = modulePathOf(ctx.files, node, varName)
      const hasModule = modulePath !== null
      const label = stepLabel(node)
      const kind = detectKind(bodyParts[i]!, label)
      // Returned only when runGraph's own return is emitted: an inline body
      // that already returns ends the graph with its own value.
      const exportKey = bodyAlreadyReturns ? undefined : exportKeys.get(varName)
      return {
        nodeId: node.id,
        ...(kind && { stepName: label, kind }),
        varName,
        ...(hasModule && { filePath: modulePath }),
        ...(exportKey !== undefined && { exportKey }),
      }
    }),
  }
  manifest.steps.push(...nestedSteps)

  return {
    source,
    files: [{ path: FUNCTION_MODULE_PATH, source: functionSource, role: 'module' }, ...ctx.files],
    manifest,
  }
}
