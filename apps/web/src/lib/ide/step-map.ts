import type { StepManifest } from '@awaitstep/codegen'
import { projectImports } from './imports'

export interface StepFileInfo {
  nodeId: string
  /**
   * The generated module this node emits — what Quick test runs — or null:
   * it is written in the workflow file (`awaitstep/workflow.ts`).
   */
  filePath: string | null
  /** The editable body of a step node, `steps/<id>.ts`, when the workspace has it; null for other nodes. */
  sourcePath: string | null
  /** The leader whose labelled step this node's code runs inside, when merged. */
  coalescedInto: string | null
  /** The key a function returns this node's value under; null when it is not returned. */
  exportKey: string | null
  /** The project files the step imports directly, read from its source when the workspace has one, else from its module. */
  uses: string[]
}

export interface StepMap {
  /** False for a version saved before sources carried a manifest. */
  hasManifest: boolean
  byNode: ReadonlyMap<string, StepFileInfo>
  /** A step's file — its source or its module — → the steps it belongs to (usually one). */
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
  /** Each step node's source path (`stepSourcePaths`); a node absent here has no editable source. */
  sourcePaths: ReadonlyMap<string, string>
}

/**
 * The link between canvas nodes and files, from data the workspace already
 * has: the manifest names each node's generated module, the IR gives each
 * step node its editable source, and the `#app/` imports in the files say
 * what each step uses.
 *
 * A node with neither (a sleep, a branch) maps to no file. Nothing here
 * touches the graph; it only reads it.
 */
export function buildStepMap(input: BuildInput): StepMap {
  const { manifest, nodeIds, files, projectPaths, sourcePaths } = input
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
    const source = sourcePaths.get(nodeId)
    const sourcePath = source !== undefined && files.has(source) ? source : null
    // The source is the body being typed; the module is the same body wrapped,
    // and only as fresh as the last save.
    const read = sourcePath ?? filePath
    byNode.set(nodeId, {
      nodeId,
      filePath,
      sourcePath,
      coalescedInto: entry?.coalescedInto ?? null,
      exportKey: entry?.exportKey ?? null,
      uses: read === null ? [] : importsFor(read),
    })
    for (const path of new Set([filePath, sourcePath])) {
      if (path !== null) {
        const list = byFile.get(path)
        if (list) list.push(nodeId)
        else byFile.set(path, [nodeId])
      }
    }
  }

  const usedBy = new Map<string, string[]>()
  for (const info of byNode.values()) {
    if (info.uses.length === 0) continue
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
    for (const path of seen) {
      const list = usedBy.get(path)
      if (list) list.push(info.nodeId)
      else usedBy.set(path, [info.nodeId])
    }
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
