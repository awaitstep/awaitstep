import type { Edge } from '@xyflow/react'
import type { WorkflowMetadata } from '@awaitstep/ir'
import type { FlowNode, InputParam, EnvBinding, WorkflowEnvVar } from '../stores/workflow-store'

const KEY_PREFIX = 'awaitstep-wf-'

export interface PersistedWorkflow {
  metadata: WorkflowMetadata
  nodes: FlowNode[]
  edges: Edge[]
  inputParams: InputParam[]
  envBindings: EnvBinding[]
  workflowEnvVars: WorkflowEnvVar[]
  savedAt: string
}

export function saveWorkflowLocally(id: string, data: PersistedWorkflow): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify(data))
  } catch {
    // Ignore quota errors silently
  }
}

export function loadWorkflowLocally(id: string): PersistedWorkflow | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${id}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.metadata || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null
    }
    return parsed as PersistedWorkflow
  } catch {
    return null
  }
}

export function removeWorkflowLocally(id: string): void {
  localStorage.removeItem(`${KEY_PREFIX}${id}`)
}

export function listLocalWorkflowIds(): string[] {
  const ids: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(KEY_PREFIX)) {
      ids.push(key.slice(KEY_PREFIX.length))
    }
  }
  return ids
}

/**
 * Creates a debounced auto-save function.
 * Returns a cleanup function to cancel pending saves.
 */
export function createAutoSave(id: string, delayMs = 1000): {
  save: (data: PersistedWorkflow) => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    save(data: PersistedWorkflow) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveWorkflowLocally(id, data)
        timer = null
      }, delayMs)
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
