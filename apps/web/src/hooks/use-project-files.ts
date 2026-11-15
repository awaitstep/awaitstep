import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { HandlerTarget } from '@awaitstep/codegen'
import { actionToast, failureLine } from '../lib/action-toast'
import type { SourceFile, WorkflowFull } from '../lib/api-client'
import type { StepPlacement } from '@awaitstep/codegen'
import { loadVersionDocument } from '../lib/ide/node-source'
import type { FileOwner } from '../lib/ide/project'
import { createProjectFileActions, type ProjectFileActions } from '../lib/ide/project-actions'
import {
  createStepCreator,
  type CreateStepOutcome,
  type NewTemplateNode,
  type FieldUpdate,
  type NodeSettings,
  type SaveNodeFieldsOutcome,
} from '../lib/ide/step-create'
import type { RemoveNodeOutcome } from '../lib/ide/step-remove'
import { createPendingFileActions } from '../lib/ide/pending-file-actions'
import { saveCheck, saveErrors } from '../lib/ide/save-check'
import { createStepSaver } from '../lib/ide/step-save'
import type { PendingGraphOp } from '../lib/ide/graph-ops'
import { discardGraphOp, discardLastGraphOp } from '../lib/ide/graph-ops-actions'
import { useIdeStore } from '../stores/ide-store'
import { useApi, useQueries } from '../contexts/api-client-context'
import { liveErrorCount } from '../lib/monaco/live-errors'

interface ProjectFilesInput {
  workflowId: string
  /** The `?version=` the workspace shows; a step save patches that version's document. */
  versionParam: string | undefined
  /** What the workflow compiles to; it decides a new fetch handler's scaffold. */
  target: HandlerTarget
  /** The loaded files with virtual seeds and step sources — not the draft overlay. */
  baseline: ReadonlyMap<string, SourceFile>
  /** Stored files, virtual seeds and step sources: the project's own. Everything else is generated. */
  projectPaths: ReadonlySet<string>
  ownerOf: (path: string) => FileOwner
  /** The workflow has a saved version to commit file writes into. */
  hasVersion: boolean
  /** The workspace accepts edits; read when an action starts, so a view gone read-only writes nothing. */
  canEdit: boolean
  /** Why it does not, worded for the person; the create action says it when it refuses. */
  readOnlyMessage: string | null
  /** Opens Search on the old import path after a rename that left importers behind. */
  onShowImporters?: (specifier: string) => void
}

export interface ProjectFilesController extends ProjectFileActions {
  /** A write is in flight. */
  busy: boolean
  /** Refetches the workspace's files and settings. */
  refresh: () => Promise<void>
  /** Adds a step (or, given `template`, a custom node) as a pending graph edit. */
  createStep: (
    placement: StepPlacement,
    name: string,
    nodeId?: string,
    template?: NewTemplateNode,
  ) => CreateStepOutcome
  /** Records an edit to one node's fields as a pending graph edit. */
  saveNodeFields: (nodeId: string, update: FieldUpdate) => SaveNodeFieldsOutcome
  /** Records any change the node's settings panel makes: fields, name, connections. */
  saveNodeEdit: (
    nodeId: string,
    update: (current: NodeSettings) => NodeSettings,
  ) => SaveNodeFieldsOutcome
  /** Removes a node, reconnecting the nodes on either side, as a pending graph edit. */
  removeNode: (nodeId: string) => RemoveNodeOutcome
  /** Discards one pending graph edit, and any later one that only applied because of it. */
  discardGraphOp: (id: string) => void
  /** Discards the last pending graph edit (⌘Z in the Steps view); false when there was none. */
  undoGraphOp: () => boolean
  /** Discards one pending Explorer change (a new, renamed or deleted file). */
  discardFileOp: (id: string) => void
}

/**
 * Binds the project-file actions to the app: the API client, toasts, the
 * session store and the queries a write invalidates (the source for the
 * files, the full workflow for the legacy settings a seed comes from and
 * the version step code is saved to).
 */
export function useProjectFiles({
  workflowId,
  versionParam,
  target,
  baseline,
  projectPaths,
  ownerOf,
  hasVersion,
  canEdit,
  readOnlyMessage,
  onShowImporters,
}: ProjectFilesInput): ProjectFilesController {
  const api = useApi()
  const queries = useQueries()
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

  // What a write in flight reads when it lands, as the workspace has it then.
  const latest = useRef({ hasVersion, canEdit, readOnlyMessage })
  latest.current = { hasVersion, canEdit, readOnlyMessage }

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] }),
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] }),
      queryClient.invalidateQueries({ queryKey: ['project-file', workflowId] }),
    ])
  }, [queryClient, workflowId])

  // Once a batch of file writes has landed, the version records the files.
  // A failure is said once; the files are saved either way.
  const commit = useCallback(async () => {
    if (!latest.current.hasVersion) return
    try {
      await api.commitVersion(workflowId)
    } catch (err) {
      if (liveWorkflow.current === workflowId) {
        actionToast.error(failureLine(err, 'Saved, but couldn’t record the version'))
      }
    }
  }, [api, workflowId])

  // One saver for the workspace's life: it holds the single-flight queue.
  const stepSaver = useMemo(
    () =>
      createStepSaver({
        workflowId,
        client: api,
        notify: actionToast,
        getStore: useIdeStore.getState,
        isCurrent: () => liveWorkflow.current === workflowId,
        // From the cache, not a render: a refetch that has landed is seen at once.
        getVersion: () =>
          loadVersionDocument(
            queryClient.getQueryData<WorkflowFull>(
              queries.workflows.full(workflowId, versionParam).queryKey,
            ),
          ),
        refresh,
        // The canvas's own Save check, so Code refuses what the canvas refuses.
        check: (doc) => saveErrors(saveCheck(doc)),
      }),
    [api, queries, queryClient, workflowId, versionParam, refresh],
  )

  // Graph edits are recorded, not posted: they are validated against the
  // version a save would build on, which the saver knows best.
  const stepCreator = useMemo(
    () =>
      createStepCreator({
        getStore: useIdeStore.getState,
        isCurrent: () => liveWorkflow.current === workflowId,
        getVersion: stepSaver.currentVersion,
        canEdit: () => latest.current.canEdit,
        readOnlyReason: () =>
          latest.current.readOnlyMessage ?? 'You can view this workflow but not edit it.',
      }),
    [workflowId, stepSaver],
  )

  // Explorer changes (New File, Rename, Delete) wait for Save, like the rest of Code.
  const pendingFiles = useMemo(
    () =>
      createPendingFileActions({
        workflowId,
        client: api,
        notify: actionToast,
        getBaseline: () => baseline,
        getStore: useIdeStore.getState,
        isCurrent: () => liveWorkflow.current === workflowId,
        isStep: (path) => ownerOf(path) === 'step',
      }),
    [api, workflowId, baseline, ownerOf],
  )

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
        ownerOf,
        saveSteps: stepSaver.save,
        commit,
        errorsIn: (path) => liveErrorCount(workflowId, path),
        refresh,
        canEdit: () => latest.current.canEdit,
        pending: pendingFiles,
        ...(onShowImporters && { onShowImporters }),
      }),
    [
      api,
      workflowId,
      target,
      baseline,
      projectPaths,
      ownerOf,
      stepSaver,
      commit,
      refresh,
      onShowImporters,
      pendingFiles,
    ],
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
      saveFiles: (paths: readonly string[]) => track(() => actions.saveFiles(paths)),
      saveAll: () => track(() => actions.saveAll()),
      isHeldBack: actions.isHeldBack,
      overwriteFile: (path: string, serverHash: string | null) =>
        track(() => actions.overwriteFile(path, serverHash)),
      recreateFile: (path: string) => track(() => actions.recreateFile(path)),
      createFile: (path: string, source?: string) => track(() => actions.createFile(path, source)),
      renameFile: (from: string, to: string) => track(() => actions.renameFile(from, to)),
      deleteFile: (path: string) => track(() => actions.deleteFile(path)),
      deleteFolder: (dir: string) => track(() => actions.deleteFolder(dir)),
      createStep: (
        placement: StepPlacement,
        name: string,
        nodeId?: string,
        template?: NewTemplateNode,
      ) => stepCreator.create(placement, name, nodeId, template),
      saveNodeFields: (nodeId: string, update: FieldUpdate) =>
        stepCreator.saveNodeFields(nodeId, update),
      saveNodeEdit: (nodeId: string, update: (current: NodeSettings) => NodeSettings) =>
        stepCreator.saveNodeEdit(nodeId, update),
      removeNode: (nodeId: string) => stepCreator.remove(nodeId),
      discardGraphOp: (id: string) => {
        const version = stepSaver.currentVersion()
        if (!version) return
        announceCascade(discardGraphOp(useIdeStore.getState, version, id))
      },
      discardFileOp: (id: string) => pendingFiles.discard(id),
      undoGraphOp: () => {
        const version = stepSaver.currentVersion()
        if (!version) return false
        const undone = discardLastGraphOp(useIdeStore.getState, version)
        if (!undone) return false
        announceCascade(undone.cascaded)
        return true
      },
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
  }, [actions, stepCreator, stepSaver, pendingFiles, busy, queryClient, workflowId, refresh])
}

/** A discard that took later edits with it says so: they needed the one discarded. */
function announceCascade(cascaded: readonly PendingGraphOp[]): void {
  if (cascaded.length === 0) return
  actionToast.info('Also discarded', {
    description: cascaded.map((entry) => entry.label).join(' · '),
  })
}
