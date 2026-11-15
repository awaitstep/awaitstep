import { useMemo } from 'react'
import { stepSourcePath } from '@awaitstep/ir'
import { followStepFunctionNames } from '@awaitstep/codegen'
import type { NodeWriter } from '../canvas/node-config-panel'
import { actionToast } from '../../lib/action-toast'
import type { NodeSettings, SaveNodeFieldsOutcome } from '../../lib/ide/step-create'
import { findEntryNodeId } from '../../lib/build-ir'
import { stepCodeForInline } from '../../lib/step-inline'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useNodeEdit } from './node-edit-context'

const UNSAVED_CODE = 'Save or revert the step’s code first: turning Inline on or off rewrites it.'

/**
 * The node settings panel's writer in Code: each change is a pending graph
 * edit at once, written with the workspace's Save (edits to one node in a
 * row merge). Turning a step's Inline on or off rewrites its code into the
 * other shape, as the canvas does — not while that code has unsaved typing.
 */
export function useCodeNodeWriter(): NodeWriter | null {
  const edit = useNodeEdit()
  return useMemo(() => {
    const save = edit?.saveNodeEdit
    if (!save) return null
    const record = (nodeId: string, update: (current: NodeSettings) => NodeSettings) =>
      report(save(nodeId, update))
    return {
      setField(nodeId, fieldId, value) {
        const isStep =
          useWorkflowStore.getState().nodes.find((n) => n.id === nodeId)?.data.irNode.type ===
          'step'
        if (fieldId === 'inline' && isStep) {
          if (useIdeStore.getState().drafts[stepSourcePath(nodeId)] !== undefined) {
            actionToast.error(UNSAVED_CODE)
            return
          }
          record(nodeId, (current) => withInline(nodeId, current, value === true))
          return
        }
        record(nodeId, (current) => ({ ...current, data: withField(current.data, fieldId, value) }))
      },
      rename(nodeId, name) {
        // A rename moves step function names (this step's, and any whose `_2`
        // suffix shifts with it): not while their files hold unsaved typing.
        const typing = renamedStepsWithDrafts(nodeId, name)
        if (typing.length > 0) {
          actionToast.error(
            `Save or revert ${typing.join(', ')} first: renaming changes its function name.`,
          )
          return
        }
        record(nodeId, (current) => ({ ...current, name }))
      },
      setOutgoing(nodeId, update) {
        record(nodeId, (current) => ({ ...current, edges: update(current.edges) }))
      },
    }
  }, [edit])
}

function report(outcome: SaveNodeFieldsOutcome): void {
  if (outcome.status !== 'recorded') actionToast.error(outcome.reason)
}

function withField(
  data: Record<string, unknown>,
  fieldId: string,
  value: unknown,
): Record<string, unknown> {
  const next = { ...data }
  if (value === undefined) delete next[fieldId]
  else next[fieldId] = value
  return next
}

/** The step with Inline set and its code in the matching shape (the graph read for its bindings). */
function withInline(nodeId: string, current: NodeSettings, inline: boolean): NodeSettings {
  const data: Record<string, unknown> = { ...current.data }
  // Unset rather than false, as the canvas stores it.
  if (inline) data.inline = true
  else delete data.inline
  const { nodes, edges, kind } = useWorkflowStore.getState()
  const irNodes = nodes.map((n) => (n.id === nodeId ? { ...n.data.irNode, data } : n.data.irNode))
  const irEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(typeof e.label === 'string' && { label: e.label }),
  }))
  const graph = {
    nodes: irNodes,
    edges: irEdges,
    entryNodeId: findEntryNodeId(irNodes, irEdges),
    kind,
  }
  return { ...current, data: { ...data, code: stepCodeForInline(graph, nodeId, inline) } }
}

/** The steps whose code a rename would rewrite and whose file has unsaved typing, by name. */
function renamedStepsWithDrafts(nodeId: string, name: string): string[] {
  const before = useWorkflowStore.getState().nodes.map((n) => n.data.irNode)
  const after = followStepFunctionNames(
    before,
    before.map((n) => (n.id === nodeId ? { ...n, name } : n)),
  )
  const drafts = useIdeStore.getState().drafts
  return after.flatMap((node, index) =>
    node.type === 'step' &&
    node.data.code !== before[index]!.data.code &&
    drafts[stepSourcePath(node.id)] !== undefined
      ? [before[index]!.name]
      : [],
  )
}
