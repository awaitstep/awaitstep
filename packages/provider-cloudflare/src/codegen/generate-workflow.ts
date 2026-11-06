import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { hasHandlerModules, projectHandlerModules } from '@awaitstep/ir'
import type {
  GeneratedBundle,
  GeneratedFile,
  GeneratorLookup,
  StepManifest,
  TemplateResolver,
} from '@awaitstep/codegen'
import {
  topologicalSort,
  sanitizeIdentifier,
  computeVarNames,
  contentHash,
  createGenerationContext,
  importSpecifiers,
  stepLabel,
  withoutComments,
  validateBundle,
  projectBundleFiles,
  indent,
} from '@awaitstep/codegen'
import { collectBranchInlineTargets } from './generators/branch.js'
import { groupChain } from './coalesce.js'
import { buildOutputConsumption } from './consumption.js'
import { generateStepGroup } from './generators/step.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { getSubScriptBindings } from './generators/sub-script.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { detectBindings } from './bindings.js'
import {
  CF_ENV_TYPE,
  collapseBlankLines,
  endsWithReturn,
  extractImports,
  collectEnvRefNames,
  envFieldName,
  generateNodeCode,
  resolveNodeExpressions,
  detectKind,
  pruneUndeclaredInputs,
  wrapModuleCalls,
} from './generate-helpers.js'
import { handlerDelegates, handlerWiring } from './handler-modules.js'
import { parseAnnotations } from './parse-annotations.js'
import {
  BOOTSTRAP_RUNTIME_IMPORT,
  CLOUDFLARE_HOST_HELPER,
  CLOUDFLARE_PRIMITIVES_IMPORT,
  FUSED_RUNTIME_IMPORT,
  WORKFLOW_RUNTIME_IMPORT,
  cloudflarePrimitivesModuleFile,
  runtimeModuleFile,
} from './runtime-module.js'
import { retentionLiteral, type CloudflareRetention } from './retention.js'

/**
 * Default trigger-code scaffold for new workflows. Uses the annotated multi-handler
 * form: `@fetch function handler(...)` for the HTTP entry point, with a comment
 * showing how to add `@queue function NAME(...)` handlers.
 *
 * Top-level code outside annotated functions becomes module scope (imports,
 * shared helpers). The @fetch handler creates and inspects workflow instances
 * via `env.WORKFLOW`. Users can replace this code via the workflow's
 * `triggerCode` field.
 */
export const DEFAULT_TRIGGER_CODE = `// import packages here

@fetch function handler(request, env, ctx) {
  try {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const params = await request.json().catch(() => undefined);
      const instance = await env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION });
      return Response.json({ instanceId: instance.id });
    }

    const instanceId = url.searchParams.get("instanceId");
    if (instanceId) {
      const instance = await env.WORKFLOW.get(instanceId);
      if (!instance) {
        return Response.json({message: 'Instance not found'}, { status: 404 })
      }
      return Response.json(await instance.status());
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}

// Add queue handlers below using:
// @queue function NAME(batch, env, ctx) { ... }
`

export interface GenerateOptions {
  templateResolver?: TemplateResolver
  envVarNames?: string[]
  triggerCode?: string
  preview?: boolean
  /**
   * Instance retention baked into the generated `AWAITSTEP_RETENTION` const,
   * which the default trigger code and sub-workflow steps pass to
   * `WORKFLOW.create()`. Unset → 7-day default (see codegen/retention.ts).
   */
  retention?: CloudflareRetention
  /** Generator lookup for node dispatch; defaults to the Cloudflare builtins. */
  generators?: GeneratorLookup
}

/**
 * @deprecated Preview-only single-file emitter. The output imports
 * `#awaitstep/runtime` (and `#awaitstep/cloudflare` when it uses a
 * provider-only primitive), so it is **not** deployable on its own — the
 * emitted runtime modules and the worker `imports` map only exist in a
 * bundle. Use {@link generateWorkflowBundle}.
 */
export function generateWorkflow(
  ir: WorkflowIR,
  templateResolverOrOptions?: TemplateResolver | GenerateOptions,
): string {
  return generateWorkflowInternal(ir, templateResolverOrOptions, false).source
}

/**
 * Bundle generation: a portable `awaitstep/workflow.ts`, a generated `Env`,
 * the runtime modules and a provider bootstrap (`worker.ts`), with step nodes
 * as standalone module files. The bundle is the deployable artifact; the
 * single-file {@link generateWorkflow} is kept only for previews/tests.
 */
export function generateWorkflowBundle(
  ir: WorkflowIR,
  templateResolverOrOptions?: TemplateResolver | GenerateOptions,
): GeneratedBundle {
  const { source, files, manifest } = generateWorkflowInternal(ir, templateResolverOrOptions, true)
  return {
    ...validateBundle({
      entry: 'worker.ts',
      primary: 'awaitstep/workflow.ts',
      files: [
        { path: 'worker.ts', source, role: 'entry' },
        ...files,
        ...projectBundleFiles(ir.runtime?.files),
      ],
    }),
    manifest,
  }
}

function generateWorkflowInternal(
  ir: WorkflowIR,
  templateResolverOrOptions: TemplateResolver | GenerateOptions | undefined,
  emitModules: boolean,
): { source: string; files: GeneratedFile[]; manifest: StepManifest } {
  const opts: GenerateOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, triggerCode, preview, retention, generators } = opts
  const className = sanitizeIdentifier(ir.metadata.name)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  const workflowId = sanitizeIdentifier(ir.metadata.name)

  const sorted = topologicalSort(ir)
  const names = computeVarNames(ir.nodes)
  // Mirror ctx.varName's truthiness fallback so pre-context consumers (the
  // expression resolver, the consumption index) agree with the generators.
  const varNameFor = (nodeId: string): string => names.get(nodeId) || sanitizeIdentifier(nodeId)
  const upstream = new Map<string, string[]>()
  if (emitModules) {
    const acc: string[] = []
    for (const node of sorted) {
      upstream.set(node.id, [...acc])
      const name = names.get(node.id)
      if (name) acc.push(name)
    }
  }
  const inlineTargets = collectBranchInlineTargets(ir)
  const useStateTracking = hasTemplateExpressions(ir.nodes)

  const resolvedIR: WorkflowIR = useStateTracking
    ? { ...ir, nodes: ir.nodes.map((n) => resolveNodeExpressions(n, varNameFor)) }
    : ir

  // Lean stored state (F9): a top-level step whose output nothing consumes
  // returns undefined, shrinking storage-billed state to what's used.
  // Container children never lean — container glue (parallel returns, loop
  // _output capture) references their vars outside any node data the
  // consumption scan can see. Built on the RESOLVED nodes so compiled
  // expressions count as references; mustStore is the single predicate for
  // both singleton leaning and group return-pruning.
  const leanCandidates = new Set(
    ir.nodes.filter((n) => n.type === 'step' && !inlineTargets.has(n.id)).map((n) => n.id),
  )
  const consumption = buildOutputConsumption(resolvedIR, varNameFor)
  const mustStore = (nodeId: string, exclude?: ReadonlySet<string>): boolean =>
    !leanCandidates.has(nodeId) || consumption.isConsumed(nodeId, exclude)

  const ctx = createGenerationContext(ir.nodes, {
    emitModules,
    upstream,
    isOutputConsumed: (nodeId) => mustStore(nodeId),
  })

  const bodyParts: string[] = []
  const emittedGroups: WorkflowNode[][] = []
  const classDefinitions = new Map<string, string>()

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n: WorkflowNode) => [n.id, n]))
  const resolvedSorted = sorted.map((n: WorkflowNode) => resolvedNodeMap.get(n.id) ?? n)

  const topLevel = resolvedSorted.filter((n: WorkflowNode) => !inlineTargets.has(n.id))
  for (const group of groupChain(topLevel, resolvedIR)) {
    emittedGroups.push(group)
    if (group.length > 1) {
      // Adjacent config-less steps merge into one billable durable step (F9).
      // Members enter the stored return object only when consumed OUTSIDE
      // the group — intra-group references live on callback-local consts.
      const groupIds: ReadonlySet<string> = new Set(group.map((n) => n.id))
      bodyParts.push(
        generateStepGroup(group, ctx, {
          includeInReturn: (nodeId) => mustStore(nodeId, groupIds),
        }),
      )
      continue
    }
    // Custom (non-registry) types fall through generateNodeCode's dispatch to
    // the same template path — one authority for what counts as builtin.
    bodyParts.push(
      generateNodeCode(
        group[0]!,
        resolvedIR,
        ctx,
        templateResolver,
        classDefinitions,
        'workflow',
        generators,
      ),
    )
  }

  const workflowImports: string[] = []
  const entryImports: string[] = []
  const strippedParts = bodyParts.map((part) => {
    const { imports, body } = extractImports(part)
    workflowImports.push(...imports)
    return body
  })

  // `env` is an alias of `flow.env` inside `run`, so user code written against
  // `env.*` keeps working without a regex rewrite of its text.
  const bodyLines = wrapModuleCalls(pruneUndeclaredInputs(strippedParts.join('\n\n')), 4)

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

  const envFields = ['  WORKFLOW: Workflow;']

  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const b of subWorkflowBindings) {
    envFields.push(`  ${envFieldName(b.binding)}: Workflow;`)
  }

  // A sub-script calls `service(env, "<binding>")`, so the binding has to be
  // on the generated Env just like a sub-workflow's.
  const subScriptBindings = getSubScriptBindings(ir.nodes)
  for (const b of subScriptBindings) envFields.push(`  ${envFieldName(b.binding)}: Fetcher;`)
  const structuralBindings = new Set([
    ...subWorkflowBindings.map((b) => b.binding),
    ...subScriptBindings.map((b) => b.binding),
  ])

  const detectedBindings = detectBindings(ir)
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

  // Handler modules (handlers/**) replace the annotation file outright: once
  // the project has any, the trigger code is not consulted and the default
  // scaffold only supplies the fetch entry when no module does.
  const modules = projectHandlerModules(ir.runtime?.files)
  const wiring = hasHandlerModules(modules) ? handlerWiring(modules) : null
  const rawTriggerCode = wiring ? DEFAULT_TRIGGER_CODE : (triggerCode ?? DEFAULT_TRIGGER_CODE)
  const parsed = parseAnnotations(rawTriggerCode)

  // Per-block import extraction (same model as generate-script). Legacy mode
  // is byte-identical to today; strict mode emits a fetch handler from the
  // @fetch declaration and a switched queue handler from @queue declarations.
  let moduleCode = ''
  let fetchHandlerEmission: { params: string; body: string } | null = null
  const queueHandlerEmissions: Array<{
    name: string
    queueName: string
    params: string
    body: string
  }> = []
  const scheduledHandlerEmissions: Array<{
    name: string
    crons: string[]
    body: string
  }> = []

  if (parsed.mode === 'legacy') {
    const { imports, body } = extractImports(parsed.fetchBody)
    entryImports.push(...imports)
    fetchHandlerEmission = { params: 'request: Request, env: Env', body }
  } else {
    if (parsed.moduleCode.trim().length > 0) {
      const { imports, body } = extractImports(parsed.moduleCode)
      entryImports.push(...imports)
      moduleCode = body
    }
    if (parsed.fetchHandler) {
      const { imports, body } = extractImports(parsed.fetchHandler.body)
      entryImports.push(...imports)
      fetchHandlerEmission = { params: parsed.fetchHandler.params, body }
    }
    for (const qh of parsed.queueHandlers) {
      const { imports, body } = extractImports(qh.body)
      entryImports.push(...imports)
      queueHandlerEmissions.push({
        name: qh.name,
        queueName: qh.queueName ?? qh.name,
        params: qh.params,
        body,
      })
    }
    for (const sh of parsed.scheduledHandlers) {
      const { imports, body } = extractImports(sh.body)
      entryImports.push(...imports)
      scheduledHandlerEmissions.push({
        name: sh.name,
        crons: sh.crons ?? [],
        body,
      })
    }
  }

  if (wiring) {
    entryImports.push(...wiring.imports)
    if (wiring.fetch) fetchHandlerEmission = null
  }

  for (const moduleFile of ctx.files) {
    if (moduleFile.role !== 'module') continue
    const match = /^nodes\/([A-Za-z0-9_]+)\.ts$/.exec(moduleFile.path)
    if (!match) {
      throw new Error(`Generated module has unexpected path: ${moduleFile.path}`)
    }
    const base = match[1]!
    // .js specifier: the deploy pipeline compiles module files to .js paths.
    workflowImports.push(`import $${base} from "../nodes/${base}.js";`)
  }

  // The bootstrap needs the runtime plus trigger-code imports. The single-file
  // emitter also runs the body inline, so it carries the workflow imports too;
  // the split bundle keeps those in `awaitstep/workflow.ts`.
  const bootstrapImportBlock = [
    'import { WorkflowEntrypoint } from "cloudflare:workers";',
    ...(emitModules
      ? [
          BOOTSTRAP_RUNTIME_IMPORT,
          'import workflow from "./awaitstep/workflow.js";',
          'import type { Env } from "./awaitstep/env.js";',
        ]
      : [FUSED_RUNTIME_IMPORT, ...new Set(workflowImports)]),
    ...new Set(entryImports),
  ].join('\n')
  const workflowImportBlock = [
    WORKFLOW_RUNTIME_IMPORT,
    'import type { Env } from "./env.js";',
    ...new Set(workflowImports),
  ].join('\n')
  const classBlock =
    !preview && classDefinitions.size > 0
      ? '\n' + [...classDefinitions.values()].join('\n\n') + '\n'
      : ''
  const cleanedModuleCode = collapseBlankLines(moduleCode).trim()
  const moduleCodeBlock = cleanedModuleCode.length > 0 ? '\n' + cleanedModuleCode + '\n' : ''

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
  if (scheduledHandlerEmissions.length > 0) {
    // One case per cron expression; multiple crons that share a handler use
    // case-fallthrough so the body emits only once per handler.
    const cases = scheduledHandlerEmissions
      .map((sh) => {
        const labels = sh.crons.map((c) => `      case "${c}":`).join('\n')
        return `${labels} {
${indent(sh.body, 8)}
        break;
      }`
      })
      .join('\n')
    handlerBlocks.push(`  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (controller.cron) {
${cases}
    }
  },`)
  }
  const exportDefault = `export default {
${handlerBlocks.join('\n')}
};${wiring && wiring.reexports.length > 0 ? `\n\n${wiring.reexports.join('\n')}` : ''}`

  // Handler modules import this from `#app/worker`, so the entry exports it
  // when one exists.
  const retentionConst = `${wiring ? 'export ' : ''}const AWAITSTEP_RETENTION = ${retentionLiteral(retention)};`

  const workflowSource = `${workflowImportBlock}

${retentionConst}
${classBlock}
export default defineWorkflow<Env>({
  id: "${workflowId}",
  async run(flow) {
    const env = flow.env;
    const event = flow.event;
    const step = durableStep(flow);
${indent(bodyLines, 4)}
  },
});
`
  const envSource = `// Generated from the workflow's declared env vars and resource bindings.
export interface Env {
${envFields.join('\n')}
}
`
  // Classes a container-child custom node needed inline are called from the
  // workflow module, so they live there too (`classBlock`), not in the entry.
  const workerSource = `${bootstrapImportBlock}

${retentionConst}

${CLOUDFLARE_HOST_HELPER}
${moduleCodeBlock}
export class ${className} extends WorkflowEntrypoint<Env> {
  async run(workflowEvent, hostStep) {
    const flow = createWorkflowContext({ env: this.env, event: workflowEvent, host: createCloudflareHost(hostStep) });
    return workflow.run(flow);
  }
}

${exportDefault}
`
  const fusedSource = `${bootstrapImportBlock}

interface Env {
${envFields.join('\n')}
}

${retentionConst}

${CLOUDFLARE_HOST_HELPER}
${classBlock}${moduleCodeBlock}
export class ${className} extends WorkflowEntrypoint<Env> {
  async run(workflowEvent, hostStep) {
    const flow = createWorkflowContext({ env: this.env, event: workflowEvent, host: createCloudflareHost(hostStep) });
    const env = flow.env;
    const event = flow.event;
    const step = durableStep(flow);
${indent(bodyLines, 4)}
  }
}

${exportDefault}
`
  const source = emitModules ? workerSource : fusedSource

  // Emit the Cloudflare primitive module whenever any shipping source imports
  // it — generated modules, project files, trigger code, inline code. Scanning
  // the actual sources (rather than a quoted substring in the import blocks)
  // catches single quotes, step-module imports and project-file imports.
  const shippedSources = [
    workflowSource,
    workerSource,
    ...ctx.files.map((file) => file.source),
    ...(ir.runtime?.files ?? []).map((file) => file.source),
  ]
  const usesCloudflarePrimitives = shippedSources.some((candidate) =>
    importSpecifiers(withoutComments(candidate)).some(
      (specifier) =>
        specifier === CLOUDFLARE_PRIMITIVES_IMPORT ||
        specifier.startsWith(`${CLOUDFLARE_PRIMITIVES_IMPORT}/`),
    ),
  )

  const manifest: StepManifest = {
    irHash: contentHash(JSON.stringify(ir)),
    steps: emittedGroups.flatMap((group, i) => {
      const part = bodyParts[i]!
      return group.map((node, j) => {
        const varName = ctx.varName(node.id)
        const modulePath = `nodes/${varName}.ts`
        const hasModule = ctx.files.some((f) => f.role === 'module' && f.path === modulePath)
        // stepName/kind are recorded only when this node's emitted code
        // actually carries its label on a durable primitive: sub-workflow
        // nodes emit derived labels, and drift validation must not demand a
        // literal that never existed. Coalesced members (j > 0) run under
        // the leader's label — coalescedInto records that linkage so run
        // telemetry can attribute the merged step record to every member.
        const label = stepLabel(node)
        const kind = j === 0 ? detectKind(part, label) : undefined
        return {
          nodeId: node.id,
          ...(kind && { stepName: label, kind }),
          ...(j > 0 && { coalescedInto: group[0]!.id }),
          varName,
          ...(hasModule && { filePath: modulePath }),
        }
      })
    }),
  }

  const files: GeneratedFile[] = emitModules
    ? [
        { path: 'awaitstep/workflow.ts', source: workflowSource, role: 'module' },
        { path: 'awaitstep/env.ts', source: envSource, role: 'module' },
        ...ctx.files,
        ...(usesCloudflarePrimitives ? [cloudflarePrimitivesModuleFile()] : []),
        runtimeModuleFile(),
      ]
    : []

  return { source, files, manifest }
}
