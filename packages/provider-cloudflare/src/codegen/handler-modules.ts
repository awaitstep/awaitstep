import type { ProjectFile, ProjectHandlerModules } from '@awaitstep/ir'
import {
  HANDLER_FETCH_PATH,
  HANDLER_QUEUE_DIR,
  HANDLER_SCHEDULED_PATH,
  HANDLER_SHARED_PATH,
  PROJECT_IMPORT_PREFIX,
  compiledPathKey,
} from '@awaitstep/ir'
import {
  handlerModuleScaffold,
  sanitizeIdentifier,
  withoutComments,
  type HandlerTarget,
} from '@awaitstep/codegen'
import type { CloudflareDeploymentConfig } from '../config-schema.js'
import { extractImports } from '@awaitstep/codegen'
import { parseAnnotations, type HandlerDecl } from './parse-annotations.js'

export { handlerModuleScaffold }
export type { HandlerTarget }

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

/** `handlers/fetch.ts` → `../handlers/fetch.js`, relative to `awaitstep/entry.ts`. */
function moduleSpecifier(path: string): string {
  return `../${compiledPathKey(path)}`
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

/**
 * The `export default` members that delegate to handler modules. A handler
 * is written against AwaitStep's contract (`FetchContext`, `QueueContext`,
 * `ScheduledContext` from `#awaitstep/runtime`); these adapt what the
 * Cloudflare runtime hands the worker into it.
 */
export function handlerDelegates(
  wiring: HandlerWiring,
  options: { sendEvent?: boolean } = {},
): string[] {
  const blocks: string[] = []
  if (wiring.fetch) {
    if (options.sendEvent) {
      blocks.push(`  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const sent = await awaitstepSendEvent(request, env);
    if (sent) return sent;
    return ${wiring.fetch}({ request, env, execution: { waitUntil: (promise) => ctx.waitUntil(promise) } });
  },`)
    } else {
      blocks.push(`  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    ${wiring.fetch}({ request, env, execution: { waitUntil: (promise) => ctx.waitUntil(promise) } }),`)
    }
  }
  if (wiring.queues.length > 0) {
    const cases = wiring.queues
      .map(
        ({ queue, identifier }) =>
          `      case "${queue}":\n        return ${identifier}({ batch: portable, env, execution });`,
      )
      .join('\n')
    blocks.push(`  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    const portable = {
      queue: batch.queue,
      messages: batch.messages.map((message) => ({ id: message.id, body: message.body })),
    };
    const execution = { waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise) };
    switch (batch.queue) {
${cases}
    }
  },`)
  }
  if (wiring.scheduled) {
    blocks.push(`  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ${wiring.scheduled}({
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      env,
      execution: { waitUntil: (promise) => ctx.waitUntil(promise) },
    }),`)
  }
  return blocks
}

/** The generated graph module a handler imports from, per kind. */
export const GRAPH_MODULE_IMPORT: Record<HandlerTarget, string> = {
  workflow: '#awaitstep/workflow',
  script: '#awaitstep/function',
}

/** Exported by the generated graph module for handler modules to import. */
const GRAPH_EXPORTS: Record<HandlerTarget, string[]> = {
  workflow: ['AWAITSTEP_RETENTION', 'startWorkflow', 'workflowStatus'],
  script: ['runGraph', 'AWAITSTEP_RETENTION'],
}

/**
 * The import a module needs from the generated graph module for the names
 * its body uses (`runGraph` in a function; `AWAITSTEP_RETENTION`,
 * `startWorkflow`, `workflowStatus` in a workflow), or an empty string. The
 * graph module imports nothing of the project, so no cycle forms.
 */
export function entryImportFor(source: string, target: HandlerTarget): string {
  const names = GRAPH_EXPORTS[target].filter((name) => new RegExp(`\\b${name}\\b`).test(source))
  return names.length > 0
    ? `import { ${names.join(', ')} } from "${GRAPH_MODULE_IMPORT[target]}";\n`
    : ''
}

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

/** The neutral handler signatures a converted module is written against. */
const FETCH_PARAMS = '{ request, env, execution }: FetchContext<Env>'
const QUEUE_PARAMS = '{ batch, env, execution }: QueueContext<Env>'
const SCHEDULED_PARAMS = '{ cron, scheduledTime, env, execution }: ScheduledContext<Env>'
/** What the neutral fetch context's fields were called positionally in the annotation model. */
const FETCH_POSITIONAL = ['request', 'env', 'execution']
const CONTEXT_TYPE_IMPORT: Record<'fetch' | 'queue' | 'scheduled', string> = {
  fetch: 'import type { FetchContext } from "#awaitstep/runtime";',
  queue: 'import type { QueueContext } from "#awaitstep/runtime";',
  scheduled: 'import type { ScheduledContext } from "#awaitstep/runtime";',
}

/**
 * What an annotated body wrote against the Cloudflare shape still finds.
 * Only the `@fetch` body saw its declared parameter names (`declared`); the
 * `@queue` and `@scheduled` bodies were inlined into handlers the generator
 * wrote, so they always saw `batch`, `controller`, `env` and `ctx`. A
 * declared name that differs from the neutral field is aliased, `ctx`
 * becomes the execution context, `controller` the schedule — each only when
 * the body uses it.
 */
function contractPrelude(
  kind: 'fetch' | 'queue' | 'scheduled',
  body: string,
  declared: readonly string[] = [],
): string {
  const plain = withoutComments(body)
  const used = (name: string) => new RegExp(`\\b${name}\\b`).test(plain)
  const lines: string[] = []
  if (kind === 'fetch') {
    declared.forEach((name, i) => {
      const field = FETCH_POSITIONAL[i]
      if (field && name !== field && used(name)) lines.push(`const ${name} = ${field};`)
    })
  }
  if (!declared.includes('ctx') && used('ctx')) lines.push('const ctx = execution;')
  if (kind === 'scheduled' && used('controller')) {
    lines.push('const controller = { cron, scheduledTime };')
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * A converted body behind its prelude, with the indentation it had inside
 * the annotation's braces removed, so the module indents it once.
 */
function convertedBody(
  kind: 'fetch' | 'queue' | 'scheduled',
  body: string,
  declared: readonly string[] = [],
): string {
  return contractPrelude(kind, body, declared) + dedent(body).trim()
}

function dedent(text: string): string {
  const lines = text.split('\n')
  const widths = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)![0].length)
  const width = widths.length > 0 ? Math.min(...widths) : 0
  return lines.map((line) => line.slice(Math.min(width, line.length))).join('\n')
}

/** The parameter names of an annotation header, without types or defaults. */
function parameterNames(params: string): string[] {
  return params
    .split(',')
    .map((part) => part.trim().split(/[\s:=]/)[0] ?? '')
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
}

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
        [CONTEXT_TYPE_IMPORT.fetch, ...imports],
        FETCH_PARAMS,
        'Promise<Response>',
        convertedBody('fetch', body),
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
    const handlerModule = (
      decl: HandlerDecl,
      kind: 'fetch' | 'queue' | 'scheduled',
      params: string,
      returns: string,
    ) => {
      const { imports, body } = extractImports(decl.body)
      return moduleSource(
        [CONTEXT_TYPE_IMPORT[kind], ...shared.imports, ...imports, ...fromShared(body)],
        params,
        returns,
        convertedBody(kind, body, kind === 'fetch' ? parameterNames(decl.params) : []),
      )
    }

    if (parsed.fetchHandler) {
      files.push({
        path: HANDLER_FETCH_PATH,
        source: handlerModule(parsed.fetchHandler, 'fetch', FETCH_PARAMS, 'Promise<Response>'),
      })
    }
    for (const qh of parsed.queueHandlers) {
      const queue = qh.queueName ?? qh.name
      queueNames.push({ name: qh.name, queue })
      files.push({
        path: `${HANDLER_QUEUE_DIR}${queue}.ts`,
        source: handlerModule(qh, 'queue', QUEUE_PARAMS, 'Promise<void>'),
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
            CONTEXT_TYPE_IMPORT.scheduled,
            ...shared.imports,
            ...bodies.flatMap((b) => b.imports),
            ...fromShared(bodies.map((b) => b.body).join('\n')),
          ],
          SCHEDULED_PARAMS,
          'Promise<void>',
          convertedBody('scheduled', body),
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
