import type { ProjectFile, ProjectHandlerModules } from '@awaitstep/ir'
import {
  HANDLER_FETCH_PATH,
  HANDLER_QUEUE_DIR,
  HANDLER_SCHEDULED_PATH,
  HANDLER_SHARED_PATH,
  PROJECT_IMPORT_PREFIX,
  compiledPathKey,
} from '@awaitstep/ir'
import { sanitizeIdentifier } from '@awaitstep/codegen'
import type { CloudflareDeploymentConfig } from '../config-schema.js'
import { extractImports } from './generate-helpers.js'
import { parseAnnotations, type HandlerDecl } from './parse-annotations.js'

/**
 * Handler modules: the folder convention that replaces the annotated
 * trigger-code file. `handlers/fetch.ts`, `handlers/scheduled.ts` and
 * `handlers/queue/<queue>.ts` are plain ES modules with a default export;
 * the generated entry imports whichever exist and wires them into its own
 * `export default`. Nothing here parses code — the filename is the only
 * fact a module contributes, everything else is declared in the IR or the
 * deployment config.
 */

/** What the generated entry imports, re-exports and delegates to. */
export interface HandlerWiring {
  imports: string[]
  /** `export * from` lines: the shared module's exports belong to the entry. */
  reexports: string[]
  fetch?: string
  scheduled?: string
  queues: { queue: string; identifier: string }[]
}

/** `handlers/fetch.ts` → `./handlers/fetch.js`: the path the deploy pipeline compiles to. */
function moduleSpecifier(path: string): string {
  return `./${compiledPathKey(path)}`
}

// Node modules import as `$<varName>` with varName in [A-Za-z0-9_], so a
// doubled `$` is a namespace a generated node import can never enter: a
// step called "queue orders" and handlers/queue/orders.ts coexist.
const HANDLER_IMPORT_PREFIX = '$$'

export function handlerWiring(modules: ProjectHandlerModules): HandlerWiring {
  const imports: string[] = []
  const reexports: string[] = []
  const wiring: HandlerWiring = { imports, reexports, queues: [] }
  if (modules.fetch) {
    wiring.fetch = `${HANDLER_IMPORT_PREFIX}fetchHandler`
    imports.push(`import ${wiring.fetch} from "${moduleSpecifier(modules.fetch)}";`)
  }
  if (modules.scheduled) {
    wiring.scheduled = `${HANDLER_IMPORT_PREFIX}scheduledHandler`
    imports.push(`import ${wiring.scheduled} from "${moduleSpecifier(modules.scheduled)}";`)
  }
  // Two valid queue names can sanitize to the same identifier (`a-b`,
  // `a--b`); a suffix keeps every import declaration distinct.
  const taken = new Set<string>()
  for (const { queue, path } of modules.queues) {
    const base = `${HANDLER_IMPORT_PREFIX}queue_${sanitizeIdentifier(queue)}`
    let identifier = base
    for (let n = 2; taken.has(identifier); n++) identifier = `${base}_${n}`
    taken.add(identifier)
    wiring.queues.push({ queue, identifier })
    imports.push(`import ${identifier} from "${moduleSpecifier(path)}";`)
  }
  // Whatever the handlers share is declared once and exported from the
  // entry, so a class the runtime must find (a Durable Object, say) is
  // still there and module-level state stays single.
  if (modules.shared) {
    reexports.push(`export * from "${moduleSpecifier(modules.shared)}";`)
  }
  return wiring
}

/** The `export default` members that delegate to handler modules. */
export function handlerDelegates(wiring: HandlerWiring): string[] {
  const blocks: string[] = []
  if (wiring.fetch) blocks.push(`  fetch: ${wiring.fetch},`)
  if (wiring.queues.length > 0) {
    const cases = wiring.queues
      .map(
        ({ queue, identifier }) =>
          `      case "${queue}":\n        return ${identifier}(batch, env, ctx);`,
      )
      .join('\n')
    blocks.push(`  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (batch.queue) {
${cases}
    }
  },`)
  }
  if (wiring.scheduled) blocks.push(`  scheduled: ${wiring.scheduled},`)
  return blocks
}

export type HandlerTarget = 'workflow' | 'script'

/** Exported by the generated entry for handler modules to import. */
const ENTRY_EXPORTS: Record<HandlerTarget, string[]> = {
  workflow: ['AWAITSTEP_RETENTION'],
  script: ['runGraph', 'AWAITSTEP_RETENTION'],
}

/**
 * The import a module needs from the generated entry for the entry-scoped
 * names its body uses (`runGraph` in a script, `AWAITSTEP_RETENTION` in
 * both), or an empty string. Those names exist only in `worker.ts`; a
 * module reaching them without the import fails at runtime.
 */
export function entryImportFor(source: string, target: HandlerTarget): string {
  const names = ENTRY_EXPORTS[target].filter((name) => new RegExp(`\\b${name}\\b`).test(source))
  return names.length > 0 ? `import { ${names.join(', ')} } from "#app/worker";\n` : ''
}

/**
 * A new handler module's starting source. `Env` is the ambient interface the
 * workspace declares for the workflow; the deploy strips the types.
 */
export function handlerModuleScaffold(
  entry:
    | { kind: 'fetch'; target: HandlerTarget }
    | { kind: 'scheduled' }
    | { kind: 'queue'; queue: string },
): string {
  switch (entry.kind) {
    case 'fetch':
      return entry.target === 'script' ? SCRIPT_FETCH_SCAFFOLD : WORKFLOW_FETCH_SCAFFOLD
    case 'scheduled':
      return SCHEDULED_SCAFFOLD
    case 'queue':
      return `// Consumer for the "${entry.queue}" queue. Per-queue settings (batch size,
// retries, dead-letter queue) live in the deployment config.
export default async function (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
  for (const message of batch.messages) {
    // process message.body
    message.ack();
  }
}
`
  }
}

const WORKFLOW_FETCH_SCAFFOLD = `import { AWAITSTEP_RETENTION } from "#app/worker";

// HTTP entry: POST creates a workflow instance, GET ?instanceId= reports its status.
export default async function (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        return Response.json({ message: "Instance not found" }, { status: 404 });
      }
      return Response.json(await instance.status());
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}
`

const SCRIPT_FETCH_SCAFFOLD = `import { runGraph } from "#app/worker";

// HTTP entry: runs the graph with the request body as payload and returns its outputs.
export default async function (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return new Response(null, { status: 200 });
    }
    const params = await request.json().catch(() => undefined);
    const graph = await runGraph(env, { payload: params });
    return Response.json(graph);
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}
`

const SCHEDULED_SCAFFOLD = `// Runs on every cron trigger of this workflow; controller.cron tells them apart.
export default async function (controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  // ...
}
`

export interface QueueConsumerSettings {
  queue: string
  maxBatchSize?: number
  maxBatchTimeout?: number
  maxRetries?: number
  deadLetterQueue?: string
  maxConcurrency?: number
}

export interface HandlerConversion {
  files: ProjectFile[]
  /** Cron expressions the annotations carried; they belong in the deployment config now. */
  crons: string[]
  /** Inline @config blocks; they belong in the deployment config's queueConsumers now. */
  queueConfigs: QueueConsumerSettings[]
  /**
   * Each queue handler's JS function name and the queue it consumes. The
   * annotation model let deployment-config overrides use either; modules
   * know only the queue, so overrides keyed by the function name are renamed.
   */
  queueNames: { name: string; queue: string }[]
}

/**
 * The handler signatures the annotation model actually ran with. Only the
 * `@fetch` body saw its declared parameters; `@queue` and `@scheduled`
 * bodies were inlined into handlers the generator wrote, so they always
 * saw these names whatever the declaration said. Converted modules keep
 * that, or the body would lose `batch` / `controller`.
 */
const QUEUE_PARAMS = 'batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext'
const SCHEDULED_PARAMS = 'controller: ScheduledController, env: Env, ctx: ExecutionContext'

/** Top-level declarations, which is what the shared module must export. */
const TOP_LEVEL_DECLARATION =
  /^(export\s+)?(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm

/**
 * Splits an annotated trigger-code source into handler modules. Imports are
 * hoisted into every module that needs them, entry-scoped names get their
 * `#app/worker` import, and the module-level code the handlers shared moves
 * into one `handlers/shared.ts` that each module imports from and the entry
 * re-exports — so it runs once and keeps its exports. Declarative facts
 * (`@crons`, `@config`) are returned, not written into code: they live in
 * the deployment config in the module model.
 */
export function handlerModulesFromTriggerCode(
  source: string,
  target: HandlerTarget,
): HandlerConversion {
  const parsed = parseAnnotations(source)
  const files: ProjectFile[] = []
  const crons: string[] = []
  const queueConfigs: QueueConsumerSettings[] = []
  const queueNames: { name: string; queue: string }[] = []

  if (parsed.mode === 'legacy') {
    const { imports, body } = extractImports(parsed.fetchBody)
    files.push({
      path: HANDLER_FETCH_PATH,
      source: moduleSource(
        imports,
        'request: Request, env: Env, ctx: ExecutionContext',
        'Promise<Response>',
        body,
      ),
    })
  } else {
    const shared = extractImports(parsed.moduleCode)
    const sharedNames = declaredNames(shared.body)
    const fromShared = (body: string): string[] => {
      const used = sharedNames.filter((name) => new RegExp(`\\b${name}\\b`).test(body))
      return used.length > 0
        ? [`import { ${used.join(', ')} } from "${PROJECT_IMPORT_PREFIX}handlers/shared";`]
        : []
    }
    // Module-level imports go to every handler that might use them (the
    // bindings they introduce are referenced directly in the bodies);
    // only the declarations move to the shared module.
    const handlerModule = (decl: HandlerDecl, params: string, returns: string) => {
      const { imports, body } = extractImports(decl.body)
      return moduleSource(
        [...shared.imports, ...imports, ...fromShared(body)],
        params,
        returns,
        body,
      )
    }

    if (parsed.fetchHandler) {
      files.push({
        path: HANDLER_FETCH_PATH,
        source: handlerModule(parsed.fetchHandler, parsed.fetchHandler.params, 'Promise<Response>'),
      })
    }
    for (const qh of parsed.queueHandlers) {
      const queue = qh.queueName ?? qh.name
      queueNames.push({ name: qh.name, queue })
      files.push({
        path: `${HANDLER_QUEUE_DIR}${queue}.ts`,
        source: handlerModule(qh, QUEUE_PARAMS, 'Promise<void>'),
      })
      if (qh.config)
        queueConfigs.push({ queue, ...(qh.config as Omit<QueueConsumerSettings, 'queue'>) })
    }
    if (parsed.scheduledHandlers.length > 0) {
      for (const sh of parsed.scheduledHandlers) crons.push(...(sh.crons ?? []))
      const bodies = parsed.scheduledHandlers.map((sh) => extractImports(sh.body))
      // Always switch on the cron, even for a single handler: the module
      // now runs for every cron the workflow registers, and only the ones
      // the annotation declared belong to this body.
      const body = `switch (controller.cron) {\n${parsed.scheduledHandlers
        .map((sh, i) => {
          const labels = (sh.crons ?? []).map((c) => `  case "${c}":`).join('\n')
          return `${labels} {\n${indent(bodies[i]!.body.trim(), 4)}\n    break;\n  }`
        })
        .join('\n')}\n}`
      files.push({
        path: HANDLER_SCHEDULED_PATH,
        source: moduleSource(
          [
            ...shared.imports,
            ...bodies.flatMap((b) => b.imports),
            ...fromShared(bodies.map((b) => b.body).join('\n')),
          ],
          SCHEDULED_PARAMS,
          'Promise<void>',
          body,
        ),
      })
    }
    if (shared.body.trim()) {
      files.unshift({
        path: HANDLER_SHARED_PATH,
        source: sharedModuleSource(shared.imports, shared.body),
      })
    }
  }

  for (const file of files) {
    file.source = entryImportFor(file.source, target) + file.source
  }
  return { files, crons: [...new Set(crons)], queueConfigs, queueNames }
}

/** The top-level names a block of module code declares. */
function declaredNames(code: string): string[] {
  const names = new Set<string>()
  for (const match of code.matchAll(TOP_LEVEL_DECLARATION)) names.add(match[2]!)
  return [...names]
}

/**
 * The handlers' shared module: the same code, with every top-level
 * declaration exported so the handlers can import it and the entry can
 * re-export it.
 */
function sharedModuleSource(imports: string[], code: string): string {
  const exported = code
    .trim()
    .replace(TOP_LEVEL_DECLARATION, (match, isExported: string | undefined) =>
      isExported ? match : `export ${match}`,
    )
  const header =
    '// Code the handlers shared in handlers.ts. The generated entry re-exports\n' +
    '// this module, so anything the runtime must find (a Durable Object class,\n' +
    '// for instance) is still exported from the Worker.'
  const parts = [...new Set(imports)]
  return [...(parts.length > 0 ? [parts.join('\n')] : []), header, exported].join('\n\n') + '\n'
}

function moduleSource(imports: string[], params: string, returns: string, body: string): string {
  const parts: string[] = []
  const unique = [...new Set(imports)]
  if (unique.length > 0) parts.push(unique.join('\n'))
  parts.push(
    `export default async function (${params}): ${returns} {\n${indent(body.trim(), 2)}\n}`,
  )
  return parts.join('\n\n') + '\n'
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
}

/**
 * The deployment config with a conversion's declarative facts folded in:
 * the annotation crons join `cronTriggers`; overrides keyed by a handler's
 * JS function name are renamed to its queue (modules know only the queue);
 * and each inline `@config` becomes (or fills the gaps of) that queue's
 * `queueConsumers` entry — settings already declared in the config win.
 * Returns the same object when nothing changes.
 */
export function withConversionSettings<T extends Partial<CloudflareDeploymentConfig>>(
  config: T,
  conversion: Pick<HandlerConversion, 'crons' | 'queueConfigs' | 'queueNames'>,
): T {
  let next = config
  const missingCrons = conversion.crons.filter((c) => !(config.cronTriggers ?? []).includes(c))
  if (missingCrons.length > 0) {
    next = { ...next, cronTriggers: [...(config.cronTriggers ?? []), ...missingCrons] }
  }
  const consumers = [...(config.queueConsumers ?? [])]
  let changed = false
  for (const { name, queue } of conversion.queueNames) {
    if (name === queue) continue
    const byName = consumers.findIndex((c) => c.queue === name)
    if (byName === -1) continue
    const renamed = { ...consumers[byName]!, queue }
    const byQueue = consumers.findIndex((c) => c.queue === queue)
    if (byQueue === -1) {
      consumers[byName] = renamed
    } else {
      consumers[byQueue] = { ...renamed, ...consumers[byQueue]! }
      consumers.splice(byName, 1)
    }
    changed = true
  }
  if (conversion.queueConfigs.length > 0 || changed) {
    for (const inline of conversion.queueConfigs) {
      const index = consumers.findIndex((c) => c.queue === inline.queue)
      if (index === -1) {
        consumers.push(inline)
        changed = true
      } else {
        const merged = { ...inline, ...consumers[index]! }
        if (JSON.stringify(merged) !== JSON.stringify(consumers[index])) {
          consumers[index] = merged
          changed = true
        }
      }
    }
    if (changed) next = { ...next, queueConsumers: consumers }
  }
  return next
}

/**
 * Why a schedule setup cannot deploy, or null. With handler modules the
 * cron expressions are declared (the workflow's cron trigger once a
 * `handlers/scheduled.ts` exists, plus the deployment config), and that
 * module is the only handler for them.
 */
export function scheduleProblem(input: {
  hasScheduledModule: boolean
  crons: readonly string[]
}): string | null {
  if (input.hasScheduledModule && input.crons.length === 0) {
    return `${HANDLER_SCHEDULED_PATH} has no schedule: add a cron trigger to the workflow or cronTriggers to the deployment config`
  }
  if (!input.hasScheduledModule && input.crons.length > 0) {
    return `Cron triggers are configured (${input.crons.join(', ')}) but there is no ${HANDLER_SCHEDULED_PATH} to run them`
  }
  return null
}
