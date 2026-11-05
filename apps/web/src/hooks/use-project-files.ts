import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { HandlerTarget } from '@awaitstep/provider-cloudflare/codegen'
import { actionToast } from '../lib/action-toast'
import { api, type SourceFile } from '../lib/api-client'
import { createProjectFileActions, type ProjectFileActions } from '../lib/ide/project-actions'
import { useIdeStore } from '../stores/ide-store'

interface ProjectFilesInput {
  workflowId: string
  /** What the workflow compiles to; it decides a new fetch handler's scaffold. */
  target: HandlerTarget
  /** The loaded files with virtual seeds — not the draft overlay. */
  baseline: ReadonlyMap<string, SourceFile>
  /** Stored files and virtual seeds: the project's own. Everything else is generated. */
  projectPaths: ReadonlySet<string>
  /** Opens Search on the old import path after a rename that left importers behind. */
  onShowImporters?: (specifier: string) => void
}

export interface ProjectFilesController extends ProjectFileActions {
  /** A write is in flight. */
  busy: boolean
  /** Refetches the workspace's files and settings. */
  refresh: () => Promise<void>
}

/**
 * Binds the project-file actions to the app: the API client, toasts, the
 * session store and the queries a write invalidates (the source for the
 * files, the full workflow for the legacy settings a seed comes from).
 */
export function useProjectFiles({
  workflowId,
  target,
  baseline,
  projectPaths,
  onShowImporters,
}: ProjectFilesInput): ProjectFilesController {
  const queryClient = useQueryClient()
  const [inFlight, setInFlight] = useState(0)

  // Writes outlive renders: a rename can finish after the user opened
  // another workflow, whose session the shared store now holds.
  const liveWorkflow = useRef<string | null>(workflowId)
  liveWorkflow.current = workflowId
  useEffect(() => {
    liveWorkflow.current = workflowId
    return () => {
      liveWorkflow.current = null
    }
  }, [workflowId])

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] }),
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] }),
    ])
  }, [queryClient, workflowId])

  const actions = useMemo(
    () =>
      createProjectFileActions({
        workflowId,
        target,
        client: api,
        notify: actionToast,
        getBaseline: () => baseline,
        getStore: useIdeStore.getState,
        isCurrent: () => liveWorkflow.current === workflowId,
        getProjectPaths: () => projectPaths,
        refresh,
        ...(onShowImporters && { onShowImporters }),
      }),
    [workflowId, target, baseline, projectPaths, refresh, onShowImporters],
  )

  const busy = inFlight > 0
  return useMemo(() => {
    async function track<T>(work: () => Promise<T>): Promise<T> {
      setInFlight((n) => n + 1)
      try {
        return await work()
      } finally {
        setInFlight((n) => n - 1)
      }
    }
    return {
      saveFile: (path: string) => track(() => actions.saveFile(path)),
      saveAll: () => track(() => actions.saveAll()),
      overwriteFile: (path: string, serverHash: string | null) =>
        track(() => actions.overwriteFile(path, serverHash)),
      recreateFile: (path: string) => track(() => actions.recreateFile(path)),
      createFile: (path: string, source?: string) => track(() => actions.createFile(path, source)),
      renameFile: (from: string, to: string) => track(() => actions.renameFile(from, to)),
      deleteFile: (path: string) => track(() => actions.deleteFile(path)),
      convertHandlers: () =>
        track(async () => {
          const result = await actions.convertHandlers()
          // The conversion rewrites the stored deployment configs; a deploy
          // page still holding the old one would save it back over them.
          if (result?.deploymentConfigUpdated) {
            await queryClient.invalidateQueries({ queryKey: ['deploy-config', workflowId] })
          }
          return result
        }),
      busy,
      refresh,
    }
  }, [actions, busy, queryClient, workflowId, refresh])
}
