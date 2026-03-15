import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { topologicalSort, buildAdjacencyList } from './dag.js'
import { sanitizeIdentifier } from './sanitize.js'
import { generateStep } from './generators/step.js'
import { generateSleep, generateSleepUntil } from './generators/sleep.js'
import { generateBranch } from './generators/branch.js'
import { generateParallel } from './generators/parallel.js'
import { generateHttp } from './generators/http.js'
import { generateWaitForEvent } from './generators/wait-for-event.js'

export function generateNodeCode(node: WorkflowNode, ir: WorkflowIR): string {
  switch (node.type) {
    case 'step':
      return generateStep(node)
    case 'sleep':
      return generateSleep(node)
    case 'sleep-until':
      return generateSleepUntil(node)
    case 'branch':
      return generateBranch(node, ir, generateNodeCode)
    case 'parallel':
      return generateParallel(node, ir, generateNodeCode)
    case 'http-request':
      return generateHttp(node)
    case 'wait-for-event':
      return generateWaitForEvent(node)
  }
}

export function generateWorkflow(ir: WorkflowIR): string {
  const className = sanitizeIdentifier(ir.metadata.name)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  const sorted = topologicalSort(ir)
  const adj = buildAdjacencyList(ir)

  // Track which nodes are targets of branch/parallel (they get generated inline)
  const inlineTargets = new Set<string>()
  for (const node of ir.nodes) {
    if (node.type === 'branch' || node.type === 'parallel') {
      for (const target of adj.get(node.id) ?? []) {
        inlineTargets.add(target)
      }
    }
  }

  const bodyLines = sorted
    .filter((node) => !inlineTargets.has(node.id))
    .map((node) => generateNodeCode(node, ir))
    .join('\n\n')

  return `import { WorkflowEntrypoint } from "cloudflare:workers";

export class ${className} extends WorkflowEntrypoint {
  async run(event, step) {
${indent(bodyLines, 4)}
  }
}
`
}

function indent(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return code
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n')
}
