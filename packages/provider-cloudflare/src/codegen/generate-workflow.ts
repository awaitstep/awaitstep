import type { Schedule, WorkflowIR } from '@awaitstep/ir'
import { PROJECT_IMPORT_PREFIX, hasHandlerModules, projectHandlerModules } from '@awaitstep/ir'
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
  mergeImports,
  generatePortableWorkflow,
  graphModuleNames,
  importSpecifiers,
  indent,
  projectBundleFiles,
  validateBundle,
  withoutComments,
  INSTANCE_ID_HEADER,
} from '@awaitstep/codegen'
import { builtinGenerators } from './generator-registry.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { getSubScriptBindings } from './generators/sub-script.js'
import { detectBindings } from './bindings.js'
import { workflowClassName } from '../naming.js'
import { CF_ENV_TYPE } from './env-types.js'
import { handlerDelegates, handlerWiring } from './handler-modules.js'
import { scheduledEmission, scheduledMember } from './schedules.js'
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
 * shared helpers). The @fetch handler starts instances through the workflow
 * module's `startWorkflow` (so the id AwaitStep names for a run is used) and
 * inspects them via `env.WORKFLOW`. Users can replace this code via the
 * workflow's `triggerCode` field.
 */
export const DEFAULT_TRIGGER_CODE = `
@fetch function handler(request, env, ctx) {
  try {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const params = await request.json().catch(() => undefined);
      return Response.json(await awaitstepStartWorkflow(env, params));
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

/** The names a fetch handler's first two parameters were declared under (`request`, `env`). */
function parameterNames(params: string): [string | undefined, string | undefined] {
  const names = params.split(',').map((part) => /^\s*([A-Za-z_$][\w$]*)/.exec(part)?.[1])
  return [names[0], names[1]]
}

const IMPORT_FROM = /\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g
const WORKFLOW_MODULE = '#awaitstep/workflow'
const EVENT_NAMES = ['sendEvent', 'getInstance']

/** The project file a specifier names (relative, or `#app/`), or undefined for any other module. */
function projectImport(
  from: string,
  specifier: string,
  sources: ReadonlyMap<string, string>,
): string | undefined {
  let base: string
  if (specifier.startsWith(PROJECT_IMPORT_PREFIX)) {
    base = specifier.slice(PROJECT_IMPORT_PREFIX.length)
  } else if (specifier.startsWith('.')) {
    base = new URL(specifier, `file:///${from}`).pathname.slice(1)
  } else {
    return undefined
  }
  const stem = base.replace(/\.[cm]?js$/, '')
  return [base, `${stem}.ts`, `${stem}.mts`, `${stem}.js`, `${stem}/index.ts`].find((path) =>
    sources.has(path),
  )
}

/** Whether an import clause from `#awaitstep/workflow` brings in a way to send events. */
function clauseSendsEvents(clause: string, source: string): boolean {
  const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1]
  if (namespace) {
    const escaped = namespace.replace(/\$/g, '\\$')
    return EVENT_NAMES.some((name) =>
      new RegExp(`(?<![\\w$])${escaped}\\??\\.${name}\\b`).test(source),
    )
  }
  const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? ''
  return named
    .split(',')
    .map(
      (name) =>
        name
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]!,
    )
    .some((name) => EVENT_NAMES.includes(name))
}

/**
 * Whether a fetch handler sends events itself: it, or a project module it
 * imports (directly or through others), takes `sendEvent` or `getInstance`
 * from `#awaitstep/workflow`. Then the built-in send-event route steps aside
 * and the handler gets every request.
 */
export function sendsEventsItself(
  entryPath: string,
  files: ReadonlyArray<{ path: string; source: string }>,
): boolean {
  const sources = new Map(files.map((file) => [file.path, file.source]))
  const seen = new Set<string>()
  const queue = [entryPath]
  while (queue.length > 0) {
    const path = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)
    const source = withoutComments(sources.get(path) ?? '')
    for (const [, clause, specifier] of source.matchAll(IMPORT_FROM)) {
      if (specifier === WORKFLOW_MODULE) {
        if (clauseSendsEvents(clause!, source)) return true
        continue
      }
      const next = projectImport(path, specifier!, sources)
      if (next) queue.push(next)
    }
  }
  return false
}

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
  /** The schedules the deployment config declares; each one's run is generated. */
  schedules?: readonly Schedule[]
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
  const { worker, files, manifest, className } = generateWorkflowInternal(
    ir,
    templateResolverOrOptions,
  )
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
    entryClass: className,
  }
}

function generateWorkflowInternal(
  ir: WorkflowIR,
  templateResolverOrOptions: TemplateResolver | GenerateOptions | undefined,
): {
  source: string
  worker: string
  files: GeneratedFile[]
  manifest: StepManifest
  className: string
} {
  const opts: GenerateOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, triggerCode, retention } = opts
  const generators = opts.generators ?? builtinGenerators
  // The one naming rule for the entrypoint class: the bundle reports it as
  // `entryClass`, and every wrangler config binds that, so the two can't
  // drift (a rename, a name starting with a digit).
  const className = /[A-Za-z0-9]/.test(ir.metadata.name)
    ? workflowClassName(ir.metadata.name)
    : 'Workflow'

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
  const hasWaitForEvent = ir.nodes.some((node) => node.type === 'wait_for_event')
  const modules = projectHandlerModules(ir.runtime?.files)
  // The built-in send-event route answers unless the project's own fetch
  // handler sends events itself: then that handler owns every request.
  const builtInSendEvent =
    hasWaitForEvent && !(modules.fetch && sendsEventsItself(modules.fetch, ir.runtime?.files ?? []))
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

  const wiringImports: string[] = []
  if (wiring) {
    wiringImports.push(...wiring.imports)
    if (wiring.fetch) fetchHandlerEmission = null
  }

  // Whether the entry has the send-event route: an inline fetch always takes it.
  const routesEvents = fetchHandlerEmission ? hasWaitForEvent : builtInSendEvent
  const handlerBlocks: string[] = []
  if (fetchHandlerEmission) {
    // The request's instance id reaches `startWorkflow` through its `env`.
    const [requestName, envName] = parameterNames(fetchHandlerEmission.params)
    const scope =
      requestName && envName
        ? `    ${envName} = awaitstepRequestEnv(${requestName}, ${envName});
`
        : ''
    const sendEvent =
      hasWaitForEvent && requestName && envName
        ? `    const sent = await awaitstepSendEvent(${requestName}, ${envName});
    if (sent) return sent;
`
        : ''
    handlerBlocks.push(`  async fetch(${fetchHandlerEmission.params}): Promise<Response> {
${scope}${sendEvent}${indent(fetchHandlerEmission.body, 4)}
  },`)
  }
  // A declared schedule an annotation already names is that annotation's to run.
  const annotationCrons = scheduledHandlerEmissions.flatMap((handler) => handler.crons)
  const scheduled = scheduledEmission({
    schedules: (opts.schedules ?? []).filter(
      (schedule) => schedule.timezone !== 'UTC' || !annotationCrons.includes(schedule.cron),
    ),
    ...(wiring?.scheduled && { handler: wiring.scheduled }),
    fallback: 'start-workflow',
  })
  if (wiring)
    handlerBlocks.push(
      ...handlerDelegates(wiring, {
        sendEvent: builtInSendEvent,
        requestEnv: true,
        ownScheduled: scheduled !== null,
      }),
    )
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
  if (scheduled || scheduledHandlerEmissions.length > 0) {
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
    handlerBlocks.push(scheduledMember(scheduled, cases))
  }
  const exportDefault = `export default {
${handlerBlocks.join('\n')}
};${wiring && wiring.reexports.length > 0 ? `\n\n${wiring.reexports.join('\n')}` : ''}`

  const moduleCodeBlock = collapseBlankLines(moduleCode).trim()

  const retentionConst = `export const AWAITSTEP_RETENTION = ${retentionLiteral(retention)};`
  const workflowHelpers = `// Declared under awaitstep names and exported under the public ones: inline
// code's imports are hoisted into this module, and a step importing its own
// \`startWorkflow\`, \`workflowStatus\`, \`getInstance\` or \`sendEvent\` must keep it.
/**
 * Starts an instance of this workflow with \`params\` as its event payload.
 * \`options.instanceId\` names it, else \`params.instanceId\`; without either, the
 * first start in a request AwaitStep sent takes the id it named, else
 * Cloudflare picks one.
 */
async function awaitstepStartWorkflow(env: Env, params: unknown, options?: { instanceId?: string }): Promise<{ instanceId: string }> {
  const named = (params as { instanceId?: unknown } | null | undefined)?.instanceId;
  const id = options?.instanceId ?? (typeof named === "string" && named.length > 0 ? named : undefined);
  const instance = await env.WORKFLOW.create({ ...(id !== undefined && { id }), params, retention: AWAITSTEP_RETENTION });
  return { instanceId: instance.id };
}

/** An instance of this workflow by id — its status and a way to send it an event — or null when there is none. */
async function awaitstepGetInstance(env: Env, instanceId: string): Promise<AwaitstepInstanceHandle | null> {
  const instance = await env.WORKFLOW.get(instanceId).catch(() => null);
  if (!instance) return null;
  return {
    instanceId,
    status: () => instance.status(),
    sendEvent: (type: string, payload?: unknown) => instance.sendEvent({ type, payload }),
  };
}

/**
 * Sends an event to an instance of this workflow: \`getInstance\`, then its \`sendEvent\`.
 * A wait for an event of this \`type\` takes its onEvent path; its value is the event, with \`payload\` as sent.
 * Throws InstanceNotFoundError when there is no instance by that id.
 */
function awaitstepSendWorkflowEvent(env: Env, instanceId: string, type: string, payload?: unknown): Promise<void> {
  return awaitstepSendInstanceEvent((id) => awaitstepGetInstance(env, id), instanceId, type, payload);
}

/** The status of an instance, or null when there is none by that id. */
async function awaitstepWorkflowStatus(env: Env, instanceId: string) {
  const instance = await awaitstepGetInstance(env, instanceId);
  return instance ? instance.status() : null;
}

export {
  awaitstepStartWorkflow as startWorkflow,
  awaitstepWorkflowStatus as workflowStatus,
  awaitstepGetInstance as getInstance,
  awaitstepSendWorkflowEvent as sendEvent,
};`

  // The helpers' runtime names join the module's own runtime import.
  const { imports: portableImports, body: portableBody } = extractImports(portable.source)
  const workflowSource = `${mergeImports([
    ...portableImports.map((statement) => ({ statement })),
    {
      statement:
        'import { sendInstanceEvent as awaitstepSendInstanceEvent, type WorkflowInstanceHandle as AwaitstepInstanceHandle } from "#awaitstep/runtime";',
    },
  ]).join('\n')}\n\n${portableBody
    .trimStart()
    .replace(
      /^export default defineWorkflow/m,
      `${retentionConst}\n\n${workflowHelpers}\n\nexport default defineWorkflow`,
    )}`

  // The bootstrap needs the runtime, the workflow module and the trigger
  // code's imports. Nothing imports the worker, so it takes from the workflow
  // module only what its own code uses: the retention, when the inline
  // default fetch (or legacy trigger code) creates instances itself.
  const entryCode = `${moduleCodeBlock}\n${exportDefault}`
  const usesRetention = graphModuleNames(entryCode, ['AWAITSTEP_RETENTION']).length > 0
  const usesStart = /\bawaitstepStartWorkflow\(/.test(entryCode)
  // The send-event route sends through the module's own `sendEvent`, under a
  // name the trigger code can't have taken.
  const graphNames = [
    ...(usesRetention ? ['AWAITSTEP_RETENTION'] : []),
    ...(usesStart ? ['startWorkflow as awaitstepStartWorkflow'] : []),
    ...(routesEvents ? ['sendEvent as awaitstepWorkflowEvent'] : []),
  ]
  const entryGenerated = [
    'import { WorkflowEntrypoint } from "cloudflare:workers";',
    `import { createWorkflowContext${routesEvents ? ', InstanceNotFoundError as AwaitstepInstanceNotFound' : ''}, type StepAttempt, type StepConfig, type WaitForEventOptions, type WorkflowHost } from "#awaitstep/runtime";`,
    'import { createAwaitstepPlatform } from "#awaitstep/platform";',
    `import workflow${graphNames.length > 0 ? `, { ${graphNames.join(', ')} }` : ''} from "#awaitstep/workflow";`,
    'import type { Env } from "#awaitstep/env";',
    ...(scheduled?.imports ?? []),
  ]
  const entryImportBlock = mergeImports([
    ...entryGenerated.map((statement) => ({ statement })),
    ...entryImports.map((statement) => ({ statement, origin: 'The trigger code' })),
    ...wiringImports.map((statement) => ({ statement })),
  ]).join('\n')
  const sendEventHelper = routesEvents
    ? `async function awaitstepSendEvent(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const body = await request.clone().json().catch(() => undefined) as Record<string, unknown> | undefined;
  const url = new URL(request.url);
  const action = body?.action ?? url.searchParams.get("action");
  if (action !== "send-event") return null;
  const instanceId = body?.instanceId ?? url.searchParams.get("instanceId");
  if (typeof instanceId !== "string" || instanceId.trim().length === 0) {
    return Response.json({ message: "instanceId is required" }, { status: 400 });
  }
  const type = body?.type ?? url.searchParams.get("type");
  if (typeof type !== "string" || type.trim().length === 0) {
    return Response.json({ message: "type is required" }, { status: 400 });
  }
  const queryAction = url.searchParams.get("action") === "send-event";
  const payload = body?.params ?? body?.payload ?? (queryAction ? body : undefined);
  try {
    await awaitstepWorkflowEvent(env, instanceId, type, payload);
  } catch (error) {
    if (error instanceof AwaitstepInstanceNotFound) {
      return Response.json({ message: "Instance not found" }, { status: 404 });
    }
    return Response.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  return Response.json({ ok: true });
}

`
    : ''
  const requestEnvHelper = `/**
 * The request's \`env\`: the same bindings, with \`WORKFLOW\` handing the instance
 * id the request names (\`${INSTANCE_ID_HEADER}\`, sent by AwaitStep) to the
 * first instance the request creates without an id of its own — through
 * \`startWorkflow\` or \`env.WORKFLOW.create\` alike.
 */
function awaitstepRequestEnv(request: Request, env: Env): Env {
  let instanceId = request.headers.get("${INSTANCE_ID_HEADER}")?.trim() || undefined;
  if (!instanceId) return env;
  const binding = env.WORKFLOW;
  const WORKFLOW = {
    create(options?: { id?: string; params?: unknown; retention?: unknown }) {
      const id = options?.id ?? instanceId;
      instanceId = undefined;
      return binding.create({ ...options, ...(id !== undefined && { id }) } as Parameters<typeof binding.create>[0]);
    },
    createBatch: (...args: Parameters<typeof binding.createBatch>) => binding.createBatch(...args),
    get: (id: string) => binding.get(id),
  };
  return { ...env, WORKFLOW: WORKFLOW as unknown as Env["WORKFLOW"] };
}

`
  const entrySource = `${entryImportBlock}

${requestEnvHelper}${sendEventHelper}${cloudflareHostHelper()}
${scheduled ? `\n${scheduled.helpers}\n` : ''}
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
    ...(scheduled?.files ?? []),
  ]

  return {
    source: entrySource,
    worker: workerSource,
    files,
    manifest: portable.manifest,
    className,
  }
}
