import type { StepManifest } from '@awaitstep/codegen'
import { projectImports } from './imports'

export interface StepFileInfo {
  nodeId: string
  /** The step file this node emits, or null: it is written in the workflow file (`awaitstep/workflow.ts`). */
  filePath: string | null
  /** The leader whose labelled step this node's code runs inside, when merged. */
  coalescedInto: string | null
  /** The project files the step file imports directly. */
  uses: string[]
}

export interface StepMap {
  /** False for a script workflow, whose source has no manifest. */
  hasManifest: boolean
  byNode: ReadonlyMap<string, StepFileInfo>
  /** A step file → the steps it belongs to (usually one). */
  byFile: ReadonlyMap<string, readonly string[]>
  /**
   * A project file → every step whose file imports it, directly or through
   * other project files, in the order the steps were given.
   */
  usedBy: ReadonlyMap<string, readonly string[]>
}

interface BuildInput {
  manifest: StepManifest | null
  /** Every node of the open version, in the order they should be reported. */
  nodeIds: readonly string[]
  /** Every file as the editor has it, drafts included. */
  files: ReadonlyMap<string, { source: string }>
  /** The files the person owns; only these can be "used by" a step. */
  projectPaths: ReadonlySet<string>
}

/**
 * The link between canvas nodes and files, from data the source response
 * already carries: the manifest names each node's module, and the `#app/`
 * imports in the files say what each module uses.
 *
 * A node with no module (a sleep, a branch) maps to no file. Nothing here
 * touches the graph; it only reads it.
 */
export function buildStepMap(input: BuildInput): StepMap {
  const { manifest, nodeIds, files, projectPaths } = input
  const entries = new Map((manifest?.steps ?? []).map((entry) => [entry.nodeId, entry]))

  const byNode = new Map<string, StepFileInfo>()
  const byFile = new Map<string, string[]>()
  const importsOf = new Map<string, string[]>()
  const importsFor = (path: string): string[] => {
    let list = importsOf.get(path)
    if (!list) {
      const file = files.get(path)
      list = file ? projectImports(file.source, path, projectPaths) : []
      importsOf.set(path, list)
    }
    return list
  }

  for (const nodeId of nodeIds) {
    const entry = entries.get(nodeId)
    const filePath =
      entry?.filePath !== undefined && files.has(entry.filePath) ? entry.filePath : null
    byNode.set(nodeId, {
      nodeId,
      filePath,
      coalescedInto: entry?.coalescedInto ?? null,
      uses: filePath === null ? [] : importsFor(filePath),
    })
    if (filePath !== null) byFile.set(filePath, [...(byFile.get(filePath) ?? []), nodeId])
  }

  const usedBy = new Map<string, string[]>()
  for (const info of byNode.values()) {
    if (info.filePath === null) continue
    // Follow imports through project files, so a helper reached by way of
    // another helper still counts as feeding this step.
    const seen = new Set<string>()
    const pending = [...info.uses]
    while (pending.length > 0) {
      const path = pending.pop()!
      if (seen.has(path)) continue
      seen.add(path)
      pending.push(...importsFor(path))
    }
    for (const path of seen) usedBy.set(path, [...(usedBy.get(path) ?? []), info.nodeId])
  }

  return { hasManifest: manifest !== null, byNode, byFile, usedBy }
}

export interface FileHighlight {
  /** The step or steps the file is the module of. */
  primary: readonly string[]
  /** Steps that import the file, when it is a project file. */
  usedBy: readonly string[]
}

const NONE: FileHighlight = { primary: [], usedBy: [] }

/** What the preview should light up for the active file. Config and generated files light nothing. */
export function highlightFor(map: StepMap, path: string | null): FileHighlight {
  if (path === null) return NONE
  const primary = map.byFile.get(path) ?? []
  const usedBy = map.usedBy.get(path) ?? []
  if (primary.length === 0 && usedBy.length === 0) return NONE
  // A step file that is also imported by another step is both; the step it
  // belongs to keeps the strong outline.
  return { primary, usedBy: usedBy.filter((id) => !primary.includes(id)) }
}
