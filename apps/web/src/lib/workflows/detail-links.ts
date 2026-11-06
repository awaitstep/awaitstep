import { useMemo } from 'react'
import { useItemSlugs } from '../../contexts/editor-scope-context'
import { itemPagePath, itemPath, runPath, type WorkspaceSlugs } from '../dashboard-paths'
import type { WorkspaceSurface } from './surfaces'

/** Where a workflow's editor and pages link to one another. */
export interface WorkflowLinks {
  overview: string
  runs: string
  run: (runId: string) => string
  deployments: string
  deploy: string
  /** Deploy, set to one version rather than the current one, and to one account when named. */
  deployVersion: (versionId: string, connectionId?: string) => string
  /** The editor on a view, at an older version when one is named. */
  editor: (view: WorkspaceSurface, extra?: { version?: string }) => string
}

function editorQuery(view: WorkspaceSurface, extra: { version?: string } = {}): string {
  return new URLSearchParams({ view, ...(extra.version && { version: extra.version }) }).toString()
}

/** A workflow's links, all in the workspace it was opened in. */
export function workflowLinks(scope: WorkspaceSlugs, workflowId: string): WorkflowLinks {
  const item = { id: workflowId }
  return {
    overview: itemPagePath(scope, item, 'overview'),
    runs: itemPagePath(scope, item, 'runs'),
    run: (runId) => runPath(scope, item, runId),
    deployments: itemPagePath(scope, item, 'deployments'),
    deploy: itemPagePath(scope, item, 'deploy'),
    deployVersion: (versionId, connectionId) =>
      `${itemPagePath(scope, item, 'deploy')}?${new URLSearchParams({
        version: versionId,
        ...(connectionId && { connection: connectionId }),
      })}`,
    editor: (view, extra) => `${itemPath(scope, item)}?${editorQuery(view, extra)}`,
  }
}

/** `workflowLinks` for the route this component is on. */
export function useWorkflowLinks(workflowId: string): WorkflowLinks {
  const scope = useItemSlugs()
  return useMemo(() => workflowLinks(scope, workflowId), [scope, workflowId])
}
