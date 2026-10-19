import { parseWorkflowModelPath } from './setup'

/** The slice of Monaco's text model the workspace manages. */
export interface WorkflowModelLike {
  uri: { toString(): string }
  getValue(): string
  setValue(value: string): void
  dispose(): void
  isDisposed(): boolean
}

export interface MonacoModelsLike {
  editor: { getModels(): readonly WorkflowModelLike[] }
}

/** Live models that belong to one workflow, paired with their bundle paths. */
export function workflowModels(
  monaco: MonacoModelsLike,
  workflowId: string,
): { model: WorkflowModelLike; file: string }[] {
  const owned: { model: WorkflowModelLike; file: string }[] = []
  for (const model of monaco.editor.getModels()) {
    if (model.isDisposed()) continue
    const parsed = parseWorkflowModelPath(model.uri.toString())
    if (parsed?.workflowId === workflowId) owned.push({ model, file: parsed.file })
  }
  return owned
}

// The file object each model was last synced from. The workspace keeps a
// file's object until its text changes, so a sync after a keystroke only
// reads the one model whose file is new instead of every model's full text.
const lastSynced = new WeakMap<WorkflowModelLike, { source: string }>()

/**
 * Brings this workflow's models in step with the loaded bundle: text is
 * replaced where it drifted and models for files that no longer exist are
 * disposed (which also drops their markers from the Problems dock). Needed
 * because the editor wrapper reuses an existing model on mount without
 * re-applying `value`, so a model left behind by an earlier mount would show
 * the previous version's source.
 */
export function syncWorkflowModels(
  monaco: MonacoModelsLike,
  workflowId: string,
  files: ReadonlyMap<string, { source: string }>,
): { updated: string[]; disposed: string[] } {
  const updated: string[] = []
  const disposed: string[] = []
  for (const { model, file } of workflowModels(monaco, workflowId)) {
    const current = files.get(file)
    if (!current) {
      model.dispose()
      disposed.push(file)
      continue
    }
    if (lastSynced.get(model) === current) continue
    if (model.getValue() !== current.source) {
      model.setValue(current.source)
      updated.push(file)
    }
    lastSynced.set(model, current)
  }
  return { updated, disposed }
}

/** Disposes every model of the workflow; returns the paths that were dropped. */
export function disposeWorkflowModels(monaco: MonacoModelsLike, workflowId: string): string[] {
  const disposed: string[] = []
  for (const { model, file } of workflowModels(monaco, workflowId)) {
    model.dispose()
    disposed.push(file)
  }
  return disposed
}
