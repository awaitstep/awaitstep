import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type SourceFile } from '../lib/api-client'
import { createProjectFileActions, type ProjectFileActions } from '../lib/ide/project-actions'
import { useIdeStore } from '../stores/ide-store'

interface ProjectFilesInput {
  workflowId: string
  /** The loaded files with virtual seeds — not the draft overlay. */
  baseline: ReadonlyMap<string, SourceFile>
}

export interface ProjectFilesController extends ProjectFileActions {
  /** A write is in flight. */
  busy: boolean
}

/**
 * Binds the project-file actions to the app: the API client, toasts, the
 * session store and the queries a write invalidates (the source for the
 * files, the full workflow for the legacy settings a seed comes from).
 */
export function useProjectFiles({
  workflowId,
  baseline,
}: ProjectFilesInput): ProjectFilesController {
  const queryClient = useQueryClient()
  const [inFlight, setInFlight] = useState(0)

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
        client: api,
        notify: toast,
        getBaseline: () => baseline,
        getStore: useIdeStore.getState,
        refresh,
      }),
    [workflowId, baseline, refresh],
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
      saveFile: (path) => track(() => actions.saveFile(path)),
      saveAll: () => track(() => actions.saveAll()),
      createFile: (path, source) => track(() => actions.createFile(path, source)),
      renameFile: (from, to) => track(() => actions.renameFile(from, to)),
      deleteFile: (path) => track(() => actions.deleteFile(path)),
      busy,
    }
  }, [actions, busy])
}
