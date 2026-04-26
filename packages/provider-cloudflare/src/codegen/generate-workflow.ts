import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import {
  topologicalSort,
  sanitizeIdentifier,
  buildVarNameMap,
  setVarNameMap,
  clearVarNameMap,
  indent,
} from '@awaitstep/codegen'
import { collectBranchInlineTargets } from './generators/branch.js'
import { generateCustomNodeParts } from './generators/custom.js'
import { getSubWorkflowBindings } from './generators/sub-workflow.js'
import { hasTemplateExpressions } from './generators/state-tracking.js'
import { detectBindings } from './bindings.js'
import {
  CF_ENV_TYPE,
  extractImports,
  generateNodeCode,
  resolveNodeExpressions,
} from './generate-helpers.js'

export const DEFAULT_TRIGGER_CODE = `try {

const url = new URL(request.url);

if (request.method === "POST") {
  const params = await request.json().catch(() => undefined);
  const instance = await env.WORKFLOW.create({ params });
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
`

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

  const resolvedNodeMap = new Map(resolvedIR.nodes.map((n: WorkflowNode) => [n.id, n]))
  const resolvedSorted = sorted.map((n: WorkflowNode) => resolvedNodeMap.get(n.id) ?? n)

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

  const envVarPattern = /\benv\.([A-Z][A-Z0-9_]*)/g
  for (const classDef of classDefinitions.values()) {
    for (const m of classDef.matchAll(envVarPattern)) {
      allEnvNames.add(m[1])
    }
  }

  const envFields = ['  WORKFLOW: Workflow;']

  const subWorkflowBindings = getSubWorkflowBindings(ir.nodes)
  for (const b of subWorkflowBindings) {
    envFields.push(`  ${b.binding}: Workflow;`)
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
