import { useMemo } from 'react'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { itemPagePath, itemPath, runPath, type WorkspaceSlugs } from '../dashboard-paths'
import type { WorkspaceSurface } from './surfaces'

/** Where a workflow's editor and pages link to one another. */
export interface WorkflowLinks {
  overview: string
  runs: string
  run: (runId: string) => string
  deployments: string
  deploy: string
  /** The editor on a view, at an older version when one is named. */
  editor: (view: WorkspaceSurface, extra?: { version?: string }) => string
}

function enc(value: string): string {
  return encodeURIComponent(value)
}

function editorQuery(view: WorkspaceSurface, extra: { version?: string } = {}): string {
  return new URLSearchParams({ view, ...(extra.version && { version: extra.version }) }).toString()
}

/**
 * At a workspace URL, a workflow's links stay in that workspace; on the old
 * `/workflows/…` pages they stay on those, until Phase 5 retires them.
 */
export function workflowLinks(scope: WorkspaceSlugs | null, workflowId: string): WorkflowLinks {
  const item = { id: workflowId }
  if (scope) {
    return {
      overview: itemPagePath(scope, item, 'overview'),
      runs: itemPagePath(scope, item, 'runs'),
      run: (runId) => runPath(scope, item, runId),
      deployments: itemPagePath(scope, item, 'deployments'),
      deploy: itemPagePath(scope, item, 'deploy'),
      editor: (view, extra) => `${itemPath(scope, item)}?${editorQuery(view, extra)}`,
    }
  }
  const base = `/workflows/${enc(workflowId)}`
  return {
    overview: base,
    runs: `${base}/runs`,
    run: (runId) => `/runs/${enc(runId)}?workflowId=${enc(workflowId)}`,
    deployments: `${base}/deployments`,
    deploy: `${base}/deploy`,
    editor: (view, extra) => `${base}/editor?${editorQuery(view, extra)}`,
  }
}

/** `workflowLinks` for the route this component is on. */
export function useWorkflowLinks(workflowId: string): WorkflowLinks {
  const scope = useEditorScope()
  return useMemo(() => workflowLinks(scope, workflowId), [scope, workflowId])
}
