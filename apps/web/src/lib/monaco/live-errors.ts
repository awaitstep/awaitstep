import { loadedMonacoInstance, workflowModelPath } from './setup'

/** The part of Monaco the lookup reads. */
export interface MarkerSource<Resource = unknown> {
  Uri: { parse(value: string): Resource }
  editor: { getModelMarkers(filter: { resource: Resource }): readonly { severity: number }[] }
}

/** Monaco's MarkerSeverity.Error. */
const ERROR_SEVERITY = 8

/**
 * The TypeScript (or JSON) errors Monaco shows on a file right now: what a
 * save holds the file back for. 0 before an editor has mounted, and for a
 * file with no model, which has never been typed in, so has no draft to save.
 */
export function liveErrorCount(
  root: string,
  path: string,
  monaco: MarkerSource | null = loadedMonacoInstance(),
): number {
  if (!monaco) return 0
  const resource = monaco.Uri.parse(workflowModelPath(root, path))
  return monaco.editor
    .getModelMarkers({ resource })
    .filter((marker) => marker.severity === ERROR_SEVERITY).length
}
