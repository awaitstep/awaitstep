import { isBuiltinNodeType } from '@awaitstep/ir'
import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { RUNTIME_MODULE_SOURCE } from '@awaitstep/sdk/runtime-source'
import { validateBundle, projectBundleFiles } from '../bundle.js'
import { computeVarNames, createGenerationContext } from '../context.js'
import { topologicalSort, upstreamVarNames } from '../dag.js'
import { indent } from '../format.js'
import type { StepManifest, StepManifestEntry } from '../manifest.js'
import { contentHash } from '../manifest.js'
import {
  callsStepModules,
  functionRuntimeImport,
  RUNTIME_MODULE_PATH,
  workflowRuntimeImport,
} from '../runtime.js'
import { maskStepLabels, stepLabel } from '../naming.js'
import type { GeneratorLookup } from '../node-generator.js'
import { sanitizeIdentifier } from '../sanitize.js'
import { normalizeStepModules } from '../step-module.js'
import { callsPlatform, withoutComments } from '../requirements.js'
import type { TemplateResolver } from '../template-resolver.js'
import type { GeneratedBundle, GeneratedFile } from '../types.js'
import { buildOutputConsumption } from './consumption.js'
import { exportPlan } from './export-plan.js'
import { boundVarNames } from './export-plan.js'
import {
  collectEnvRefNames,
  detectKind,
  endsWithReturn,
  extractImports,
  generateNodeCode,
  resolveNodeExpressions,
  wrapModuleCalls,
} from './generate-helpers.js'
import { builtinGenerators } from './generator-registry.js'
import { collectBranchInlineTargets } from './generators/branch.js'
import { generateStepGroup } from './generators/step.js'
import { importOrigin, mergeImports, type ImportSource } from '../imports.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { groupChain } from './coalesce.js'
import { assertStepPathsFree, modulePathOf } from './module-files.js'

/** The core runtime module every generated bundle carries. */
function runtimeFile(): GeneratedFile {
  return {
    path: RUNTIME_MODULE_PATH,
    source: `// Generated from @awaitstep/sdk — do not edit.\n${RUNTIME_MODULE_SOURCE}`,
    role: 'module',
  }
}

/** The portable workflow module a universal bundle exposes as its entry. */
export const UNIVERSAL_WORKFLOW_PATH = 'awaitstep/workflow.ts'

/** The generated `Env` module the workflow module imports. */
export const UNIVERSAL_ENV_PATH = 'awaitstep/env.ts'

export interface UniversalGenerateOptions {
  templateResolver?: TemplateResolver
  /** Env names the workflow already declares (secrets and variables). */
  envVarNames?: string[]
  /**
   * Node emitters. Defaults to the provider-neutral builtin set; a graph
   * containing a provider-only node (a sub-workflow call, a service
   * binding) needs the provider's registry and is not universal.
   */
  generators?: GeneratorLookup
}

/**
 * Generates the provider-neutral half of a workflow: one `awaitstep/workflow.ts`
 * that imports `#awaitstep/runtime`, the `Env` it reads, and a module per
 * node. Nothing here names a deploy target — a provider package wraps this
 * module in its own bootstrap and deploy configuration.
 *
 * The bundle has no `worker.ts`: there is no provider entry to emit. That is
 * the point of the universal flavor, and why a caller that needs a runnable
 * artifact composes this with a provider.
 */
export function generateUniversalWorkflowBundle(
  ir: WorkflowIR,
  options: UniversalGenerateOptions = {},
): GeneratedBundle {
  assertStepPathsFree(ir)
  const { source, files, manifest, envSource } = generate(ir, options)
  return {
    ...validateBundle({
      entry: UNIVERSAL_WORKFLOW_PATH,
      primary: UNIVERSAL_WORKFLOW_PATH,
      files: [
        { path: UNIVERSAL_WORKFLOW_PATH, source, role: 'entry' },
        { path: UNIVERSAL_ENV_PATH, source: envSource, role: 'module' },
        ...files,
        runtimeFile(),
        ...projectBundleFiles(ir.runtime?.files),
      ],
    }),
    manifest,
  }
}

/** The portable workflow module alone, for previews and tests. */
export function generateUniversalWorkflow(
  ir: WorkflowIR,
  options: UniversalGenerateOptions = {},
): string {
  return generate(ir, options).source
}

export interface PortableWorkflow {
  source: string
  envSource: string
  files: GeneratedFile[]
  manifest: StepManifest
}

/**
 * The portable half of a workflow bundle, for a provider that adds its own
 * bootstrap. Same emitter as {@link generateUniversalWorkflowBundle}, without
 * the provider-only-node refusal when the caller says it can handle them.
 */
export function generatePortableWorkflow(
  ir: WorkflowIR,
  options: UniversalGenerateOptions = {},
): PortableWorkflow {
  return generate(ir, options)
}

function generate(ir: WorkflowIR, options: UniversalGenerateOptions): PortableWorkflow {
  assertStepPathsFree(ir)
  const { templateResolver, envVarNames } = options
  const generators = options.generators ?? builtinGenerators
  const workflowId = sanitizeIdentifier(ir.metadata.name)

  const sorted = topologicalSort(ir)
  const names = computeVarNames(ir.nodes)
  const varNameFor = (nodeId: string): string => names.get(nodeId) || sanitizeIdentifier(nodeId)
  const upstream = upstreamVarNames(ir, boundVarNames(ir, names), () => false)
  const inlineTargets = collectBranchInlineTargets(ir)
  const useStateTracking = hasTemplateExpressions(ir.nodes)

  const normalizedIR = normalizeStepModules(ir)
  const resolvedIR: WorkflowIR = useStateTracking
    ? {
        ...normalizedIR,
        nodes: normalizedIR.nodes.map((node) => resolveNodeExpressions(node, varNameFor)),
      }
    : normalizedIR

  const leanCandidates = new Set(
    ir.nodes.filter((node) => node.type === 'step' && !inlineTargets.has(node.id)).map((n) => n.id),
  )
  const consumption = buildOutputConsumption(resolvedIR, varNameFor, upstream)
  const mustStore = (nodeId: string, exclude?: ReadonlySet<string>): boolean =>
    !leanCandidates.has(nodeId) || consumption.isConsumed(nodeId, exclude)

  const ctx = createGenerationContext(ir.nodes, {
    emitModules: true,
    upstream,
    isOutputConsumed: (nodeId) => mustStore(nodeId),
  })

  const bodyParts: string[] = []
  const emittedGroups: WorkflowNode[][] = []
  const classDefinitions = new Map<string, string>()

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((node) => [node.id, node]))
  const resolvedSorted = sorted.map((node) => resolvedNodeMap.get(node.id) ?? node)
  const topLevel = resolvedSorted.filter((node) => !inlineTargets.has(node.id))

  for (const group of groupChain(topLevel, resolvedIR)) {
    emittedGroups.push(group)
    if (group.length > 1) {
      const groupIds: ReadonlySet<string> = new Set(group.map((node) => node.id))
      bodyParts.push(
        generateStepGroup(group, ctx, {
          includeInReturn: (nodeId) => mustStore(nodeId, groupIds),
        }),
      )
      continue
    }
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

  const workflowImports: ImportSource[] = []
  const strippedParts = bodyParts.map((part, i) => {
    const { imports, body } = extractImports(part)
    const origin = importOrigin(emittedGroups[i]?.[0])
    workflowImports.push(...imports.map((statement) => ({ statement, origin })))
    return body
  })
  const bodyLines = wrapModuleCalls(strippedParts.join('\n\n'), 4)

  for (const file of ctx.files) {
    if (file.role === 'module') workflowImports.push({ statement: moduleImportFor(file) })
  }

  const envSource = generateEnvSource(ir, envVarNames ?? [], ctx.files, classDefinitions)
  const classBlock =
    classDefinitions.size > 0 ? '\n' + [...classDefinitions.values()].join('\n\n') + '\n' : ''
  const hasWait = ir.nodes.some((node) => node.type === 'wait_for_event')
  const workflowSource = `${mergeImports([
    {
      statement: workflowRuntimeImport({ callsStepModules: callsStepModules(ctx.files), hasWait }),
    },
    { statement: 'import type { Env } from "#awaitstep/env";' },
    ...workflowImports,
  ]).join('\n')}
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

  const manifest: StepManifest = {
    irHash: contentHash(JSON.stringify(ir)),
    steps: emittedGroups.flatMap((group, i) => {
      const part = bodyParts[i]!
      return group.map((node) => {
        const entry: StepManifestEntry = {
          nodeId: node.id,
          varName: ctx.varName(node.id),
        }
        const path = modulePathOf(ctx.files, node, ctx.varName(node.id))
        if (path !== null) entry.filePath = path
        const member = group.length > 1 && node.id !== group[0]!.id
        if (member) entry.coalescedInto = group[0]!.id
        const label = stepLabel(node)
        // Only the group leader's part carries the label; a member runs
        // inside it and is linked through `coalescedInto`.
        const kind = member ? undefined : detectKind(part, label)
        if (kind !== undefined) {
          entry.stepName = label
          entry.kind = kind
        }
        return entry
      })
    }),
  }
  // Container children are modules too. Their label is claimed only when
  // the emitted container body actually carries it on a primitive.
  const workflowBodyText = bodyParts.join('\n')
  for (const node of resolvedSorted) {
    if (!inlineTargets.has(node.id)) continue
    const path = modulePathOf(ctx.files, node, ctx.varName(node.id))
    if (path === null) continue
    if (manifest.steps.some((entry) => entry.nodeId === node.id)) continue
    const label = stepLabel(node)
    const labeled =
      workflowBodyText.includes(`flow.step("${label}"`) ||
      workflowBodyText.includes(`flow.step(\`${label} [`)
    manifest.steps.push({
      nodeId: node.id,
      ...(labeled && { stepName: label, kind: 'do' as const }),
      varName: ctx.varName(node.id),
      filePath: path,
    })
  }

  return { source: workflowSource, envSource, files: ctx.files, manifest }
}

/** The env file a universal module reads: names and bindings, no provider types. */
function generateEnvSource(
  ir: WorkflowIR,
  envVarNames: readonly string[],
  files: readonly GeneratedFile[],
  classDefinitions: Map<string, string>,
): string {
  const names = new Set(envVarNames)
  for (const name of collectEnvRefNames(ir.nodes)) names.add(name)
  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const definition of classDefinitions.values()) {
    for (const match of definition.matchAll(envVarPattern)) names.add(match[1]!)
  }
  for (const file of files) {
    if (file.role !== 'module') continue
    for (const match of file.source.matchAll(envVarPattern)) names.add(match[1]!)
  }
  const fields = [...names]
    .sort()
    .map((name) => `  ${identifierField(name)}: string;`)
    .join('\n')
  return `// Generated from the workflow's declared env vars and bindings.
export interface Env {
${fields}
}
`
}

function identifierField(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

/** The import for a generated module, through the project's `#app/` alias. */
function moduleImportFor(file: GeneratedFile): string {
  const specifier = `#app/${file.path.replace(/\.ts$/, '.js')}`
  if (file.binding) return `import ${file.binding} from "${specifier}";`
  const match = /^nodes\/([A-Za-z0-9_]+)\.ts$/.exec(file.path)
  if (!match) throw new Error(`Generated module has unexpected path: ${file.path}`)
  return `import $${match[1]} from "${specifier}";`
}

/** The portable graph module a universal function bundle exposes as its entry. */
export const UNIVERSAL_FUNCTION_PATH = 'awaitstep/function.ts'

/** Kinds whose value is always bound, whether or not anything reads it. */
const RESULT_CONTAINERS: ReadonlySet<string> = new Set(['parallel', 'race', 'loop'])

export type UniversalFunctionOptions = UniversalGenerateOptions

/**
 * The provider-neutral half of a function: `awaitstep/function.ts` with its
 * `runGraph`, one module per node, and the `Env` it reads. No fetch handler
 * and no worker entry — those belong to the provider that serves the request.
 */
export function generateUniversalFunctionBundle(
  ir: ScriptIR,
  options: UniversalFunctionOptions = {},
): GeneratedBundle {
  assertStepPathsFree(ir)
  const { source, envSource, files, manifest } = generateFunction(ir, options)
  return {
    ...validateBundle({
      entry: UNIVERSAL_FUNCTION_PATH,
      primary: UNIVERSAL_FUNCTION_PATH,
      files: [
        { path: UNIVERSAL_FUNCTION_PATH, source, role: 'entry' },
        { path: UNIVERSAL_ENV_PATH, source: envSource, role: 'module' },
        ...files,
        runtimeFile(),
        ...projectBundleFiles(ir.runtime?.files),
      ],
    }),
    manifest,
  }
}

/** The portable function graph module alone, for previews and tests. */
export function generateUniversalFunction(
  ir: ScriptIR,
  options: UniversalFunctionOptions = {},
): string {
  return generateFunction(ir, options).source
}

function generateFunction(
  ir: ScriptIR,
  options: UniversalFunctionOptions,
): {
  source: string
  envSource: string
  files: GeneratedFile[]
  manifest: StepManifest
} {
  assertStepPathsFree(ir)
  const { templateResolver, envVarNames } = options
  const generators = options.generators ?? builtinGenerators
  // A Call Workflow / Call Function node, or code calling another artifact
  // through `flow`: either way the context needs the platform adapter.
  const hasSubCalls = callsPlatform(ir.nodes)
  ir = normalizeStepModules(ir)
  const irAsWorkflow = ir as unknown as WorkflowIR
  const sorted = topologicalSort(irAsWorkflow)
  const names = computeVarNames(ir.nodes)
  const plan = exportPlan(irAsWorkflow)
  const upstream = upstreamVarNames(irAsWorkflow, boundVarNames(ir, names), (node) =>
    plan.has(node.id),
  )
  const ctx = createGenerationContext(ir.nodes, { emitModules: true, upstream })
  const useStateTracking = hasTemplateExpressions(ir.nodes)
  const inlineTargets = collectBranchInlineTargets(irAsWorkflow)
  const resolvedIR: ScriptIR = useStateTracking
    ? { ...ir, nodes: ir.nodes.map((n) => resolveNodeExpressions(n, (id) => ctx.varName(id))) }
    : ir

  const bodyParts: string[] = []
  const emittedNodes: WorkflowNode[] = []
  const classDefinitions = new Map<string, string>()
  const resolvedNodeMap = new Map(resolvedIR.nodes.map((node) => [node.id, node]))
  const resolvedSorted = sorted.map((node) => resolvedNodeMap.get(node.id) ?? node)

  for (const node of resolvedSorted) {
    if (inlineTargets.has(node.id)) continue
    bodyParts.push(
      generateNodeCode(
        node,
        resolvedIR as unknown as WorkflowIR,
        ctx,
        templateResolver,
        classDefinitions,
        'script',
        generators,
      ),
    )
    emittedNodes.push(node)
  }

  const graphImports: ImportSource[] = []
  const strippedParts = bodyParts.map((part, i) => {
    const { imports, body } = extractImports(part)
    const origin = importOrigin(emittedNodes[i])
    graphImports.push(...imports.map((statement) => ({ statement, origin })))
    return body
  })
  let graphBody = strippedParts.join('\n\n')

  const exportKeys = new Map<string, string>()
  const hoistedVarNames: string[] = []
  for (const node of resolvedSorted) {
    const varName = ctx.varName(node.id)
    const declRe = new RegExp(`^([ \\t]*)const ${varName}\\s*=`, 'm')
    const match = declRe.exec(graphBody)
    if (!match) continue
    const planned = plan.get(node.id)
    const isNested = match[1]!.length > 0
    // A reference is the bare identifier: not the node's name inside a step
    // label, not the `$name` module import at its call.
    const refMatches = [
      ...maskStepLabels(graphBody).matchAll(new RegExp(`(?<![$"'])\\b${varName}\\b(?!["'])`, 'g')),
    ]
    const isReferencedElsewhere = refMatches.length > 1

    if (planned) {
      exportKeys.set(varName, planned.key)
      if (isNested) {
        hoistedVarNames.push(varName)
        graphBody = graphBody.replace(new RegExp(`\\bconst ${varName}\\s*=`, 'g'), `${varName} =`)
      }
    } else if (
      !isReferencedElsewhere &&
      !RESULT_CONTAINERS.has(node.type) &&
      // A template node that returns a value keeps its binding, read or not.
      isBuiltinNodeType(node.type)
    ) {
      graphBody = graphBody.replace(new RegExp(`\\bconst ${varName}\\s*=\\s*(await\\b)`, 'g'), '$1')
    }
  }

  const declStatement = hoistedVarNames.length > 0 ? `  let ${hoistedVarNames.join(', ')};\n` : ''
  graphBody = wrapModuleCalls(graphBody, 2)
  // A platform call anywhere in the graph's code needs the context (and its
  // PlatformHost import), even from a node the graph doesn't reach yet.
  const usesFlow =
    hasSubCalls ||
    ctx.files.some((file) => file.role === 'module') ||
    /\b(?:flow\??\.(?:step|sleep|sleepUntil|waitForEvent|http|startWorkflow|workflowStatus|getInstance|sendEvent|callScript)|step\.(?:do|sleep|sleepUntil|waitForEvent))\(/.test(
      withoutComments(graphBody),
    )
  // A host is only needed where something runs through it: a step, a wait or
  // another artifact. A context that only makes HTTP calls goes without.
  const needsHost =
    hasSubCalls ||
    /\b(?:flow\??\.(?:step|sleep|sleepUntil|waitForEvent)|step\.(?:do|sleep|sleepUntil|waitForEvent))\(/.test(
      withoutComments(graphBody),
    )
  const contextLines = usesFlow
    ? [
        '  const flow = createWorkflowContext({',
        '    env,',
        '    event: {',
        '      payload: event.payload,',
        '      timestamp: new Date(),',
        '      instanceId: globalThis.crypto.randomUUID(),',
        '    },',
        ...(needsHost
          ? [
              hasSubCalls
                ? '    host: createInlineHost(platform),'
                : '    host: createInlineHost(),',
            ]
          : []),
        '  });',
        ...(needsHost ? ['  const step = durableStep(flow);'] : []),
        '',
      ].join('\n')
    : ''
  const bodyAlreadyReturns = endsWithReturn(graphBody)
  const returnStatement = bodyAlreadyReturns
    ? ''
    : exportKeys.size > 0
      ? `  return { ${[...exportKeys].map(([value, key]) => (key === value ? value : `${key}: ${value}`)).join(', ')} };`
      : '  return {};'
  const runGraphBody =
    graphBody.trim().length > 0 ? indent(graphBody, 2) + (bodyAlreadyReturns ? '' : '\n') : ''
  const runGraphBlock = hasSubCalls
    ? `export async function runGraph(env: Env, event: { payload: unknown }, platform?: PlatformHost) {
${contextLines}${declStatement}${runGraphBody}${returnStatement}
}`
    : `export async function runGraph(env: Env, event: { payload: unknown }) {
${contextLines}${declStatement}${runGraphBody}${returnStatement}
}`

  const moduleImports: string[] = []
  for (const moduleFile of ctx.files) {
    if (moduleFile.role !== 'module') continue
    moduleImports.push(moduleImportFor(moduleFile))
  }
  const functionImports = mergeImports([
    { statement: 'import type { Env } from "#awaitstep/env";' },
    ...(usesFlow
      ? [
          {
            statement: functionRuntimeImport({
              needsHost,
              hasSubCalls,
              callsStepModules: callsStepModules(ctx.files),
            }),
          },
        ]
      : []),
    ...moduleImports.map((statement) => ({ statement })),
    ...graphImports,
  ])
  const classBlock =
    classDefinitions.size > 0 ? '\n' + [...classDefinitions.values()].join('\n\n') + '\n' : ''
  const envSource = generateEnvSource(irAsWorkflow, envVarNames ?? [], ctx.files, classDefinitions)
  const source = `${functionImports.join('\n')}
${classBlock}
${runGraphBlock}
`

  const topLevelIds = new Set(emittedNodes.map((node) => node.id))
  const nestedSteps: StepManifestEntry[] = resolvedSorted
    .filter((node) => node.type === 'step' && !topLevelIds.has(node.id))
    .flatMap((node) => {
      const varName = ctx.varName(node.id)
      const modulePath = modulePathOf(ctx.files, node, varName)
      if (modulePath === null) return []
      const exportKey = bodyAlreadyReturns ? undefined : exportKeys.get(varName)
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
      const label = stepLabel(node)
      const kind = detectKind(bodyParts[i]!, label)
      const exportKey = bodyAlreadyReturns ? undefined : exportKeys.get(varName)
      return {
        nodeId: node.id,
        ...(kind && { stepName: label, kind }),
        varName,
        ...(modulePath !== null && { filePath: modulePath }),
        ...(exportKey !== undefined && { exportKey }),
      }
    }),
  }
  manifest.steps.push(...nestedSteps)

  return { source, envSource, files: ctx.files, manifest }
}
