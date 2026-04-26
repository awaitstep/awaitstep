import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { resolveExpressions } from '@awaitstep/ir'
import type { GenerateMode, TemplateResolver } from '@awaitstep/codegen'
import { varName } from '@awaitstep/codegen'
import { generateStep } from './generators/step.js'
import { generateSleep, generateSleepUntil } from './generators/sleep.js'
import { generateBranch } from './generators/branch.js'
import { generateParallel } from './generators/parallel.js'
import { generateHttp } from './generators/http.js'
import { generateWaitForEvent } from './generators/wait-for-event.js'
import { generateCustomNode, generateCustomNodeParts } from './generators/custom.js'
import { generateTryCatch } from './generators/try-catch.js'
import { generateLoop } from './generators/loop.js'
import { generateBreak } from './generators/break.js'
import { generateSubWorkflow } from './generators/sub-workflow.js'
import { generateRace } from './generators/race.js'
import type { BindingType } from './bindings.js'

/**
 * Cloudflare Worker `Env` interface field type for each detected binding kind.
 * `secret` and `variable` are intentionally `null` — they're emitted as
 * `string` fields alongside other string env vars, not as typed bindings.
 */
export const CF_ENV_TYPE: Record<BindingType, string | null> = {
  kv: 'KVNamespace',
  d1: 'D1Database',
  r2: 'R2Bucket',
  queue: 'Queue<unknown>',
  service: 'Fetcher',
  ai: 'Ai',
  vectorize: 'VectorizeIndex',
  analytics_engine: 'AnalyticsEngineDataset',
  hyperdrive: 'Hyperdrive',
  browser: 'Fetcher',
  secret: null,
  variable: null,
}

/**
 * Splits `import` statements (single- or multi-line) from the rest of a code
 * block. Used to hoist user-trigger-code imports to the top of the generated
 * Worker file alongside imports from per-node generators.
 */
export function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split('\n')
  const imports: string[] = []
  const bodyLines: string[] = []
  let pendingImport: string[] | null = null

  for (const line of lines) {
    if (pendingImport) {
      pendingImport.push(line)
      if (/from\s+['"]/.test(line)) {
        imports.push(pendingImport.join('\n').trim())
        pendingImport = null
      }
    } else if (/^\s*import\s+/.test(line)) {
      if (/from\s+['"]/.test(line)) {
        imports.push(line.trim())
      } else {
        pendingImport = [line]
      }
    } else {
      bodyLines.push(line)
    }
  }

  if (pendingImport) {
    bodyLines.push(...pendingImport)
  }

  return { imports, body: bodyLines.join('\n') }
}

/**
 * Dispatches per-node code generation to the appropriate generator. Custom
 * node templates are looked up via `templateResolver` and (when
 * `classDefinitions` is provided) hoisted to module top level.
 */
export function generateNodeCode(
  node: WorkflowNode,
  ir: WorkflowIR,
  templateResolver?: TemplateResolver,
  classDefinitions?: Map<string, string>,
  mode: GenerateMode = 'workflow',
): string {
  const recurse = (n: WorkflowNode, ir2: WorkflowIR) =>
    generateNodeCode(n, ir2, templateResolver, classDefinitions, mode)

  switch (node.type) {
    case 'step':
      return generateStep(node, mode)
    case 'sleep':
      return generateSleep(node)
    case 'sleep_until':
      return generateSleepUntil(node)
    case 'branch':
      return generateBranch(node, ir, recurse)
    case 'parallel':
      return generateParallel(node, ir, recurse, mode)
    case 'http_request':
      return generateHttp(node, mode)
    case 'wait_for_event':
      return generateWaitForEvent(node)
    case 'try_catch':
      return generateTryCatch(node, ir, recurse)
    case 'loop':
      return generateLoop(node, ir, recurse, mode)
    case 'break':
      return generateBreak(node)
    case 'sub_workflow':
      return generateSubWorkflow(node, mode)
    case 'race':
      return generateRace(node, ir, recurse, mode)
    default: {
      if (templateResolver) {
        const template = templateResolver.getTemplate(node.type, node.provider)
        if (template) {
          if (classDefinitions) {
            const parts = generateCustomNodeParts(node, template, mode)
            if (!classDefinitions.has(parts.className)) {
              classDefinitions.set(parts.className, parts.classDefinition)
            }
            return parts.imports.join('\n') + '\n' + parts.stepCode
          }
          return generateCustomNode(node, template, mode)
        }
      }
      throw new Error(`Codegen not yet implemented for node type: ${node.type}`)
    }
  }
}

/**
 * Walks a node's `data` and replaces `{{ <expr> }}` template strings with
 * their resolved JS expressions, using the active `varName` map. Run on a
 * per-node copy when the IR contains template expressions.
 */
export function resolveNodeExpressions(node: WorkflowNode): WorkflowNode {
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
