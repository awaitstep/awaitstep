import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { resolveExpressions } from '@awaitstep/ir'
import type { CodeGenerator } from '@awaitstep/codegen'
import { topologicalSort, sanitizeIdentifier, buildVarNameMap, setVarNameMap, clearVarNameMap, varName } from '@awaitstep/codegen'
import { generateStep } from './generators/step.js'
import { generateSleep, generateSleepUntil } from './generators/sleep.js'
import { generateBranch, collectBranchInlineTargets } from './generators/branch.js'
import { generateParallel } from './generators/parallel.js'
import { generateHttp } from './generators/http.js'
import { generateWaitForEvent } from './generators/wait-for-event.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'

export function generateNodeCode(node: WorkflowNode, ir: WorkflowIR): string {
  switch (node.type) {
    case 'step':
      return generateStep(node)
    case 'sleep':
      return generateSleep(node)
    case 'sleep_until':
      return generateSleepUntil(node)
    case 'branch':
      return generateBranch(node, ir, generateNodeCode)
    case 'parallel':
      return generateParallel(node, ir, generateNodeCode)
    case 'http_request':
      return generateHttp(node)
    case 'wait_for_event':
      return generateWaitForEvent(node)
    default:
      throw new Error(`Codegen not yet implemented for node type: ${node.type}`)
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

export function generateWorkflow(ir: WorkflowIR): string {
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

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n) => [n.id, n]))
  const resolvedSorted = sorted.map((n) => resolvedNodeMap.get(n.id) ?? n)

  for (const node of resolvedSorted) {
    if (inlineTargets.has(node.id)) continue
    bodyParts.push(generateNodeCode(node, resolvedIR))
  }

  const bodyLines = bodyParts.join('\n\n')
  clearVarNameMap()

  return `import { WorkflowEntrypoint } from "cloudflare:workers";

interface Env {
  WORKFLOW: Workflow;
}

export class ${className} extends WorkflowEntrypoint<Env> {
  async run(event, step) {
${indent(bodyLines, 4)}
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const instance = await env.WORKFLOW.create();
      return Response.json({ instanceId: instance.id });
    }

    const instanceId = url.searchParams.get("instanceId");
    if (instanceId) {
      const instance = await env.WORKFLOW.get(instanceId);
      return Response.json(await instance.status());
    }

    return new Response(null, { status: 200 });
  },
};
`
}

function indent(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return code
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n')
}

export class CloudflareCodeGenerator implements CodeGenerator {
  readonly name = 'cloudflare-workflows'

  generateWorkflow(ir: WorkflowIR): string {
    return generateWorkflow(ir)
  }
}
