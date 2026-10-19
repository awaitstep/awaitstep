import { fileLanguage } from '../ide/file-tree'
import { parseWorkflowModelPath, workflowModelPath } from './setup'

/** The slice of Monaco's text model the workspace manages. */
export interface WorkflowModelLike {
  uri: { toString(): string }
  getValue(): string
  setValue(value: string): void
  dispose(): void
  isDisposed(): boolean
}

export interface MonacoModelsLike {
  editor: {
    getModels(): readonly WorkflowModelLike[]
    createModel(value: string, language: string, uri: unknown): WorkflowModelLike
  }
  Uri: { parse(value: string): unknown }
}

/** Live models that belong to one workflow, paired with their bundle paths. */
export function workflowModels(
  monaco: Pick<MonacoModelsLike, 'editor'>,
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
 * Makes this workflow's models exactly the loaded bundle: a model for every
 * file, created up front rather than when a tab opens, so TypeScript sees
 * the whole project (imports resolve across files and the Problems dock
 * reports files nobody has opened); text replaced where it drifted; models
 * for files that no longer exist disposed (which also drops their markers).
 * Creating eagerly also matters because the editor wrapper reuses an
 * existing model on mount without re-applying `value`, so a model left
 * behind by an earlier mount would otherwise show stale source.
 */
export function syncWorkflowModels(
  monaco: MonacoModelsLike,
  workflowId: string,
  files: ReadonlyMap<string, { source: string }>,
): { created: string[]; updated: string[]; disposed: string[] } {
  const created: string[] = []
  const updated: string[] = []
  const disposed: string[] = []
  const seen = new Set<string>()
  for (const { model, file } of workflowModels(monaco, workflowId)) {
    const current = files.get(file)
    if (!current) {
      model.dispose()
      disposed.push(file)
      continue
    }
    seen.add(file)
    if (lastSynced.get(model) === current) continue
    if (model.getValue() !== current.source) {
      model.setValue(current.source)
      updated.push(file)
    }
    lastSynced.set(model, current)
  }
  for (const [file, current] of files) {
    if (seen.has(file)) continue
    const uri = monaco.Uri.parse(workflowModelPath(workflowId, file))
    const model = monaco.editor.createModel(current.source, fileLanguage(file), uri)
    lastSynced.set(model, current)
    created.push(file)
  }
  return { created, updated, disposed }
}

/** Disposes every model of the workflow; returns the paths that were dropped. */
export function disposeWorkflowModels(
  monaco: Pick<MonacoModelsLike, 'editor'>,
  workflowId: string,
): string[] {
  const disposed: string[] = []
  for (const { model, file } of workflowModels(monaco, workflowId)) {
    model.dispose()
    disposed.push(file)
  }
  return disposed
}
