import type { WorkflowIR } from '@awaitstep/ir'
import { hasHandlerModules, projectHandlerModules } from '@awaitstep/ir'
import type {
  GeneratedBundle,
  GeneratedFile,
  GeneratorLookup,
  StepManifest,
  TemplateResolver,
} from '@awaitstep/codegen'
import {
  collectEnvRefNames,
  collapseBlankLines,
  endsWithReturn,
  envFieldName,
  extractImports,
  generatePortableWorkflow,
  graphModuleNames,
  importSpecifiers,
  indent,
  projectBundleFiles,
  sanitizeIdentifier,
  validateBundle,
  withoutComments,
} from '@awaitstep/codegen'
import { builtinGenerators } from './generator-registry.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { getSubScriptBindings } from './generators/sub-script.js'
import { detectBindings } from './bindings.js'
import { CF_ENV_TYPE } from './env-types.js'
import { handlerDelegates, handlerWiring } from './handler-modules.js'
import { parseAnnotations } from './parse-annotations.js'
import {
  cloudflareHostHelper,
  platformModuleFile,
  CLOUDFLARE_PRIMITIVES_IMPORT,
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
export const DEFAULT_TRIGGER_CODE = `
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
 * The bundle's entry (`worker.ts`) as a string, for previews and tests — the
 * bootstrap that imports `awaitstep/workflow.ts`, the step modules and the
 * runtime. A deployable artifact is the bundle from
 * {@link generateWorkflowBundle}.
 */
export function generateWorkflow(
  ir: WorkflowIR,
  templateResolverOrOptions?: TemplateResolver | GenerateOptions,
): string {
  return generateWorkflowInternal(ir, templateResolverOrOptions).source
}

/**
 * Bundle generation: a portable `awaitstep/workflow.ts`, a generated `Env`,
 * the runtime modules and a provider bootstrap (`worker.ts`), with step nodes
 * as standalone module files. The bundle is the deployable artifact; the
 * single-file {@link generateWorkflow} is kept only for previews/tests.
 *
 * The portable module comes from `@awaitstep/codegen`'s universal emitter —
 * the same source the IDE previews — and this function only adds what is
 * Cloudflare's: the retention helpers, the typed `Env`, and the bootstrap.
 */
export function generateWorkflowBundle(
  ir: WorkflowIR,
  templateResolverOrOptions?: TemplateResolver | GenerateOptions,
): GeneratedBundle {
  const { worker, files, manifest } = generateWorkflowInternal(ir, templateResolverOrOptions)
  return {
    ...validateBundle({
      entry: 'worker.ts',
      primary: 'awaitstep/workflow.ts',
      files: [
        { path: 'worker.ts', source: worker, role: 'entry' },
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
): { source: string; worker: string; files: GeneratedFile[]; manifest: StepManifest } {
  const opts: GenerateOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, triggerCode, retention } = opts
  const generators = opts.generators ?? builtinGenerators
  const className = sanitizeIdentifier(ir.metadata.name)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  // The provider-neutral half: the workflow module, one module per step and
  // the manifest. Cloudflare-only nodes (sub-workflow, call-script) are
  // allowed because this package registers their generators.
  const portable = generatePortableWorkflow(ir, {
    templateResolver,
    envVarNames,
    generators,
  })
  const stepModules = portable.files

  // Every env name the graph reads — declared variables, `{{env.X}}`
  // expressions, custom-node template classes and step modules.
  const allEnvNames = new Set(envVarNames ?? [])
  for (const name of collectEnvRefNames(ir.nodes)) allEnvNames.add(name)
  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const source of [portable.source, ...stepModules.map((file) => file.source)]) {
    for (const match of source.matchAll(envVarPattern)) allEnvNames.add(match[1]!)
  }

  // Cloudflare-shaped Env: the self-binding, sub-workflow/service bindings,
  // resource bindings, then plain string variables.
  const envFields = ['  WORKFLOW: Workflow;']
  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const binding of subWorkflowBindings) {
    envFields.push(`  ${envFieldName(binding.binding)}: Workflow;`)
  }
  const subScriptBindings = getSubScriptBindings(ir.nodes)
  for (const binding of subScriptBindings) {
    envFields.push(`  ${envFieldName(binding.binding)}: Fetcher;`)
  }
  const structuralBindings = new Set([
    ...subWorkflowBindings.map((binding) => binding.binding),
    ...subScriptBindings.map((binding) => binding.binding),
  ])
  const bindingNames = new Set<string>(structuralBindings)
  for (const binding of detectBindings(ir)) {
    if (structuralBindings.has(binding.name)) continue
    const cfType = CF_ENV_TYPE[binding.type]
    if (cfType) {
      envFields.push(`  ${envFieldName(binding.name)}: ${cfType};`)
      bindingNames.add(binding.name)
    }
  }
  for (const name of allEnvNames) {
    if (!bindingNames.has(name)) envFields.push(`  ${envFieldName(name)}: string;`)
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
  const entryImports: string[] = []

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
    for (const queueHandler of parsed.queueHandlers) {
      const { imports, body } = extractImports(queueHandler.body)
      entryImports.push(...imports)
      queueHandlerEmissions.push({
        name: queueHandler.name,
        queueName: queueHandler.queueName ?? queueHandler.name,
        params: queueHandler.params,
        body,
      })
    }
    for (const scheduledHandler of parsed.scheduledHandlers) {
      const { imports, body } = extractImports(scheduledHandler.body)
      entryImports.push(...imports)
      scheduledHandlerEmissions.push({
        name: scheduledHandler.name,
        crons: scheduledHandler.crons ?? [],
        body,
      })
    }
  }

  if (wiring) {
    entryImports.push(...wiring.imports)
    if (wiring.fetch) fetchHandlerEmission = null
  }

  const handlerBlocks: string[] = []
  if (fetchHandlerEmission) {
    handlerBlocks.push(`  async fetch(${fetchHandlerEmission.params}): Promise<Response> {
${indent(fetchHandlerEmission.body, 4)}
  },`)
  }
  if (wiring) handlerBlocks.push(...handlerDelegates(wiring))
  if (queueHandlerEmissions.length > 0) {
    const cases = queueHandlerEmissions
      .map((queueHandler) => {
        const trailing = endsWithReturn(queueHandler.body) ? '' : '\n        return'
        return `      case "${queueHandler.queueName}": {
${indent(queueHandler.body, 8)}${trailing}
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
      .map((scheduledHandler) => {
        const labels = scheduledHandler.crons.map((cron) => `      case "${cron}":`).join('\n')
        return `${labels} {
${indent(scheduledHandler.body, 8)}
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

  const moduleCodeBlock = collapseBlankLines(moduleCode).trim()

  const retentionConst = `export const AWAITSTEP_RETENTION = ${retentionLiteral(retention)};`
  const workflowHelpers = `/** Starts an instance of this workflow with \`params\` as its event payload. */
export async function startWorkflow(env: Env, params: unknown): Promise<{ instanceId: string }> {
  const instance = await env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION });
  return { instanceId: instance.id };
}

/** The status of an instance, or null when there is none by that id. */
export async function workflowStatus(env: Env, instanceId: string) {
  const instance = await env.WORKFLOW.get(instanceId).catch(() => null);
  return instance ? instance.status() : null;
}`
  const workflowSource = portable.source.replace(
    '\nexport default defineWorkflow',
    `\n${retentionConst}\n\n${workflowHelpers}\n\nexport default defineWorkflow`,
  )

  // The bootstrap needs the runtime, the workflow module and the trigger
  // code's imports. Nothing imports the worker, so it takes from the workflow
  // module only what its own code uses: the retention, when the inline
  // default fetch (or legacy trigger code) creates instances itself.
  const usesRetention =
    graphModuleNames(`${moduleCodeBlock}\n${exportDefault}`, ['AWAITSTEP_RETENTION']).length > 0
  const entryImportBlock = [
    'import { WorkflowEntrypoint } from "cloudflare:workers";',
    'import { createWorkflowContext, type StepAttempt, type StepConfig, type WaitForEventOptions, type WorkflowHost } from "#awaitstep/runtime";',
    'import { createAwaitstepPlatform } from "#awaitstep/platform";',
    `import workflow${usesRetention ? ', { AWAITSTEP_RETENTION }' : ''} from "#awaitstep/workflow";`,
    'import type { Env } from "#awaitstep/env";',
    ...new Set(entryImports),
  ].join('\n')
  const entrySource = `${entryImportBlock}

${cloudflareHostHelper()}

${moduleCodeBlock.length > 0 ? moduleCodeBlock + '\n' : ''}
export class ${className} extends WorkflowEntrypoint<Env> {
  async run(workflowEvent, hostStep) {
    const flow = createWorkflowContext({ env: this.env, event: workflowEvent, host: createAwaitstepHost(hostStep, this.env) });
    return workflow.run(flow);
  }
}

${exportDefault}
`
  // The entry is provider-neutral: it only re-exports the provider entry the
  // build selected. Cloudflare's entry lives in awaitstep/entry.ts.
  const workerSource = `// Generated from @awaitstep/codegen — the deploy target is bound at build time.
export * from "#awaitstep/entry";
export { default } from "#awaitstep/entry";
`

  const envSource = `// Generated from the workflow's declared env vars and resource bindings.
export interface Env {
${envFields.join('\n')}
}
`

  // Emit the Cloudflare primitive module whenever any shipping source imports
  // it — generated modules, project files, trigger code, inline code. Scanning
  // the actual sources (rather than a quoted substring in the import blocks)
  // catches single quotes, step-module imports and project-file imports.
  const shippedSources = [
    workflowSource,
    entrySource,
    ...stepModules.map((file) => file.source),
    ...(ir.runtime?.files ?? []).map((file) => file.source),
  ]
  const usesCloudflarePrimitives = shippedSources.some((candidate) =>
    importSpecifiers(withoutComments(candidate)).some(
      (specifier) =>
        specifier === CLOUDFLARE_PRIMITIVES_IMPORT ||
        specifier.startsWith(`${CLOUDFLARE_PRIMITIVES_IMPORT}/`),
    ),
  )

  const files: GeneratedFile[] = [
    { path: 'awaitstep/workflow.ts', source: workflowSource, role: 'module' },
    { path: 'awaitstep/env.ts', source: envSource, role: 'module' },
    { path: 'awaitstep/entry.ts', source: entrySource, role: 'module' },
    platformModuleFile(retentionLiteral(retention)),
    ...stepModules,
    ...(usesCloudflarePrimitives ? [cloudflarePrimitivesModuleFile()] : []),
    runtimeModuleFile(),
  ]

  return { source: entrySource, worker: workerSource, files, manifest: portable.manifest }
}
