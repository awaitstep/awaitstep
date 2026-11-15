import type { ArtifactIR } from '@awaitstep/ir'
import { fallbackPosition } from '../hydrate-workflow'
import {
  validateWorkflowForPublish,
  type PublishIssue,
  type PublishValidationResult,
} from '../validate-workflow'
import type { FlowNode } from '../../stores/workflow-store'

/**
 * What a save refuses on: the canvas's own check (`validateWorkflowForPublish`
 * with no registry, as the canvas's Save runs it), on the document a save
 * would write. Code's Save runs it on the version it is about to post, so the
 * two modes refuse the same workflows with the same words.
 */
export function saveCheck(doc: ArtifactIR): PublishValidationResult {
  const nodes: FlowNode[] = doc.nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    position: node.position ?? fallbackPosition(index),
    data: { irNode: node },
  }))
  const edges = doc.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label !== undefined && { label: edge.label }),
  }))
  return validateWorkflowForPublish(
    doc.metadata,
    nodes,
    edges,
    undefined,
    undefined,
    doc.kind === 'script' ? 'script' : 'workflow',
  )
}

/** The errors a save refuses on, "<node>: <message>" when about a node. */
export function saveErrors(result: PublishValidationResult): PublishIssue[] {
  return result.issues.filter((issue) => issue.severity === 'error')
}

/** "Fix 1 issue before saving" / "Fix 3 issues before saving", as the canvas says it. */
export function fixBeforeSaving(count: number): string {
  return count === 1 ? 'Fix 1 issue before saving' : `Fix ${count} issues before saving`
}
