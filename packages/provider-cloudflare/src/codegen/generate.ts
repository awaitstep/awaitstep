import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { resolveExpressions } from '@awaitstep/ir'
import type { CodeGenerator, TemplateResolver } from '@awaitstep/codegen'
import {
  topologicalSort,
  sanitizeIdentifier,
  buildVarNameMap,
  setVarNameMap,
  clearVarNameMap,
  varName,
  indent,
} from '@awaitstep/codegen'
import { generateStep } from './generators/step.js'
import { generateSleep, generateSleepUntil } from './generators/sleep.js'
import { generateBranch, collectBranchInlineTargets } from './generators/branch.js'
import { generateParallel } from './generators/parallel.js'
import { generateHttp } from './generators/http.js'
import { generateWaitForEvent } from './generators/wait-for-event.js'
import { generateCustomNode, generateCustomNodeParts } from './generators/custom.js'
import { generateTryCatch } from './generators/try-catch.js'
import { generateLoop } from './generators/loop.js'
import { generateBreak } from './generators/break.js'
import { generateSubWorkflow, getSubWorkflowBindings } from './generators/sub-workflow.js'
import { generateRace } from './generators/race.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { detectBindings, type BindingType } from './bindings.js'

export const DEFAULT_TRIGGER_CODE = `const url = new URL(request.url);

if (request.method === "POST") {
  const params = await request.json().catch(() => undefined);
  const instance = await env.WORKFLOW.create({ params });
  return Response.json({ instanceId: instance.id });
}

const instanceId = url.searchParams.get("instanceId");
if (instanceId) {
  const instance = await env.WORKFLOW.get(instanceId);
  return Response.json(await instance.status());
}

return new Response(null, { status: 200 });`

export function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split('\n')
  const imports: string[] = []
  const bodyLines: string[] = []

  for (const line of lines) {
    if (/^\s*import\s+/.test(line) && /from\s+['"]/.test(line)) {
      imports.push(line.trim())
    } else {
      bodyLines.push(line)
    }
  }

  return { imports, body: bodyLines.join('\n') }
}

export function generateNodeCode(
  node: WorkflowNode,
  ir: WorkflowIR,
  templateResolver?: TemplateResolver,
  classDefinitions?: Map<string, string>,
): string {
  const recurse = (n: WorkflowNode, ir2: WorkflowIR) =>
    generateNodeCode(n, ir2, templateResolver, classDefinitions)

  switch (node.type) {
    case 'step':
      return generateStep(node)
    case 'sleep':
      return generateSleep(node)
    case 'sleep_until':
      return generateSleepUntil(node)
    case 'branch':
      return generateBranch(node, ir, recurse)
    case 'parallel':
      return generateParallel(node, ir, recurse)
    case 'http_request':
      return generateHttp(node)
    case 'wait_for_event':
      return generateWaitForEvent(node)
    case 'try_catch':
      return generateTryCatch(node, ir, recurse)
    case 'loop':
      return generateLoop(node, ir, recurse)
    case 'break':
      return generateBreak(node)
    case 'sub_workflow':
      return generateSubWorkflow(node)
    case 'race':
      return generateRace(node, ir, recurse)
    default: {
      if (templateResolver) {
        const template = templateResolver.getTemplate(node.type, node.provider)
        if (template) {
          // Hoist class definition to top level when classDefinitions map is provided
          if (classDefinitions) {
            const parts = generateCustomNodeParts(node, template)
            if (!classDefinitions.has(parts.className)) {
              classDefinitions.set(parts.className, parts.classDefinition)
            }
            return parts.imports.join('\n') + '\n' + parts.stepCode
          }
          return generateCustomNode(node, template)
        }
      }
      throw new Error(`Codegen not yet implemented for node type: ${node.type}`)
    }
  }
}

function resolveNodeExpressions(node: WorkflowNode): WorkflowNode {
  const resolvedData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.data)) {
    if (typeof value === 'string') {
      resolvedData[key] = resolveExpressions(value, varName)
    } else if (Array.isArray(value)) {
      resolvedData[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const resolved: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            resolved[k] = typeof v === 'string' ? resolveExpressions(v, varName) : v
          }
          return resolved
        }
        return typeof item === 'string' ? resolveExpressions(item, varName) : item
      })
    } else {
      resolvedData[key] = value
    }
  }
  return { ...node, data: resolvedData }
}

export interface GenerateOptions {
  templateResolver?: TemplateResolver
  envVarNames?: string[]
  triggerCode?: string
  preview?: boolean
}

export function generateWorkflow(
  ir: WorkflowIR,
  templateResolverOrOptions?: TemplateResolver | GenerateOptions,
): string {
  const opts: GenerateOptions = templateResolverOrOptions
    ? 'getTemplate' in templateResolverOrOptions
      ? { templateResolver: templateResolverOrOptions }
      : templateResolverOrOptions
    : {}
  const { templateResolver, envVarNames, triggerCode, preview } = opts
  const className = sanitizeIdentifier(ir.metadata.name)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  const sorted = topologicalSort(ir)
  const nameMap = buildVarNameMap(ir.nodes)
  setVarNameMap(nameMap)
  const useStateTracking = hasTemplateExpressions(ir.nodes)

  const inlineTargets = collectBranchInlineTargets(ir)

  const resolvedIR: WorkflowIR = useStateTracking
    ? { ...ir, nodes: ir.nodes.map(resolveNodeExpressions) }
    : ir

  const bodyParts: string[] = []
  const classDefinitions = new Map<string, string>()

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n) => [n.id, n]))
  const resolvedSorted = sorted.map((n) => resolvedNodeMap.get(n.id) ?? n)

  const builtinTypes = new Set([
    'step',
    'sleep',
    'sleep_until',
    'branch',
    'parallel',
    'http_request',
    'wait_for_event',
    'try_catch',
    'loop',
    'break',
    'sub_workflow',
    'race',
  ])

  for (const node of resolvedSorted) {
    if (inlineTargets.has(node.id)) continue

    if (!builtinTypes.has(node.type) && templateResolver) {
      const template = templateResolver.getTemplate(node.type, node.provider)
      if (template) {
        const parts = generateCustomNodeParts(node, template)
        if (!classDefinitions.has(parts.className)) {
          classDefinitions.set(parts.className, parts.classDefinition)
        }
        bodyParts.push(parts.imports.join('\n') + '\n' + parts.stepCode)
        continue
      }
    }

    bodyParts.push(generateNodeCode(node, resolvedIR, templateResolver, classDefinitions))
  }

  // Extract and hoist imports from generated node code
  const collectedImports: string[] = []
  const strippedParts = bodyParts.map((part) => {
    const { imports, body } = extractImports(part)
    collectedImports.push(...imports)
    return body
  })

  const bodyLines = strippedParts.join('\n\n').replace(/\benv\./g, 'this.env.')
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

  // Scan class definitions for env.VARIABLE references (custom node templates)
  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const classDef of classDefinitions.values()) {
    for (const m of classDef.matchAll(envVarPattern)) {
      allEnvNames.add(m[1])
    }
  }

  const envFields = ['  WORKFLOW: Workflow;']

  // Add sub-workflow bindings
  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const binding of subWorkflowBindings) {
    envFields.push(`  ${binding}: Workflow;`)
  }

  // Add typed fields for auto-detected resource bindings
  const CF_ENV_TYPE: Record<BindingType, string | null> = {
    kv: 'KVNamespace',
    d1: 'D1Database',
    r2: 'R2Bucket',
    queue: 'Queue<unknown>',
    service: 'Fetcher',
    secret: null,
    variable: null,
  }
  const detectedBindings = detectBindings(ir)
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

  const rawTriggerCode = triggerCode ?? DEFAULT_TRIGGER_CODE
  const { imports: triggerImports, body: fetchBody } = extractImports(rawTriggerCode)
  collectedImports.push(...triggerImports)

  const uniqueImports = [...new Set(collectedImports)]
  const importBlock = uniqueImports.length > 0 ? '\n' + uniqueImports.join('\n') : ''
  const classBlock =
    !preview && classDefinitions.size > 0
      ? '\n' + [...classDefinitions.values()].join('\n\n') + '\n'
      : ''

  return `import { WorkflowEntrypoint } from "cloudflare:workers";${importBlock}

interface Env {
${envFields.join('\n')}
}
${classBlock}
export class ${className} extends WorkflowEntrypoint<Env> {
  async run(event, step) {
${indent(bodyLines, 4)}
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
${indent(fetchBody, 4)}
  },
};
`
}

export class CloudflareCodeGenerator implements CodeGenerator {
  readonly name = 'cloudflare-workflows'
  private templateResolver?: TemplateResolver

  constructor(templateResolver?: TemplateResolver) {
    this.templateResolver = templateResolver
  }

  generateWorkflow(ir: WorkflowIR): string {
    return generateWorkflow(ir, this.templateResolver)
  }
}
