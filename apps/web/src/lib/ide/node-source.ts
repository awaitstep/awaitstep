import type { ArtifactIR, WorkflowNode } from '@awaitstep/ir'
import { contentHash, loadArtifact, stepSourcePath } from '@awaitstep/ir'
import type { SourceFile, WorkflowFull } from '../api-client'
import type { Problem } from './problems'

/**
 * The nodes whose body Code shows as a file of its own: builtin steps,
 * wherever they sit — top level, inside a container, in a function. Other
 * builtins have settings, not code; custom nodes keep their read-only module.
 */
export function isStepNode(node: Pick<WorkflowNode, 'type'>): boolean {
  return node.type === 'step'
}

/** The body a step source shows: exactly `data.code`, an empty file while the node has none. */
export function stepCode(node: Pick<WorkflowNode, 'data'>): string {
  const code = node.data.code
  return typeof code === 'string' ? code : ''
}

/** Node id → `steps/<id>.ts` for every step node, in the order given. */
export function stepSourcePaths(
  nodes: Iterable<Pick<WorkflowNode, 'id' | 'type'>>,
): Map<string, string> {
  const paths = new Map<string, string>()
  for (const node of nodes) {
    if (isStepNode(node)) paths.set(node.id, stepSourcePath(node.id))
  }
  return paths
}

export interface StepSourceCollision {
  path: string
  /** The step nodes that map to the path, in document order. */
  nodeIds: string[]
  /** A project file is stored at the path (from before the folder was reserved); it keeps it. */
  stored: boolean
}

export interface StepSources {
  /** One file per step node, in the document's node order; a node in `collisions` has none. */
  files: SourceFile[]
  byNode: ReadonlyMap<string, SourceFile>
  /** Path → node id. */
  byPath: ReadonlyMap<string, string>
  /**
   * Paths that cannot be one step's file: two nodes map to them, or a
   * project file is stored there. Only an imported document can produce
   * either (an id spelled exactly like another id's rewritten path; a
   * `steps/` file from before the folder was reserved). Nothing is projected
   * for such a path, so no edit can ever be routed to the wrong node or
   * shown under a file's name; the workspace reports them instead.
   */
  collisions: StepSourceCollision[]
}

const NO_STORED: ReadonlySet<string> = new Set()

/**
 * The step sources of a version document: a view, never stored, whose text
 * is the node's code and whose hash is the precondition a step draft is
 * checked against before it is saved (the same hash the file ETags use).
 * `storedPaths` are the project files actually stored; one at a step's path
 * wins, and the step is reported rather than shadowed.
 */
export function stepSources(
  ir: ArtifactIR,
  storedPaths: ReadonlySet<string> = NO_STORED,
): StepSources {
  const claims = new Map<string, WorkflowNode[]>()
  for (const node of ir.nodes) {
    if (!isStepNode(node)) continue
    const path = stepSourcePath(node.id)
    claims.set(path, [...(claims.get(path) ?? []), node])
  }

  const files: SourceFile[] = []
  const byNode = new Map<string, SourceFile>()
  const byPath = new Map<string, string>()
  const collisions: StepSourceCollision[] = []
  for (const [path, nodes] of claims) {
    const stored = storedPaths.has(path)
    if (nodes.length > 1 || stored) {
      collisions.push({ path, nodeIds: nodes.map((n) => n.id), stored })
      continue
    }
    const node = nodes[0]!
    const source = stepCode(node)
    const file: SourceFile = { path, source, role: 'source', hash: contentHash(source) }
    files.push(file)
    byNode.set(node.id, file)
    byPath.set(path, node.id)
  }
  return { files, byNode, byPath, collisions }
}

/**
 * The document with the edited bodies written back into their nodes and
 * nothing else touched: node order, settings, positions, edges, trigger,
 * metadata and runtime come through as they were. An edit for a node that
 * is not a step node, or that the document does not have, is ignored — the
 * saver refuses those before it gets here — and an edit equal to the
 * current body leaves the node as it is, so an unchanged file never moves
 * the graph.
 */
export function applyStepSources(ir: ArtifactIR, edits: ReadonlyMap<string, string>): ArtifactIR {
  if (edits.size === 0) return ir
  let changed = false
  const nodes = ir.nodes.map((node) => {
    const code = edits.get(node.id)
    if (code === undefined || !isStepNode(node) || code === stepCode(node)) return node
    changed = true
    return { ...node, data: { ...node.data, code } }
  })
  return changed ? { ...ir, nodes } : ir
}

/** The loaded version as a document Code can patch, with the base its save names. */
export interface LoadedVersion {
  /** The stored document, parsed and migrated — every byte the canvas saved. */
  doc: ArtifactIR
  /** `WorkflowFull.graphHash` for `doc`: the `baseGraphHash` a save built on it sends. */
  graphHash: string
}

/**
 * The version document behind a `/full` response, or null while there is no
 * version or the stored text cannot be read as one (a legacy or
 * schema-invalid row). Null means Code shows no step files and refuses to
 * save any: it would have nothing sound to patch.
 */
export function loadVersionDocument(
  full: Pick<WorkflowFull, 'version' | 'graphHash'> | undefined,
): LoadedVersion | null {
  if (!full?.version || full.graphHash === null || typeof full.version.ir !== 'string') return null
  const result = loadArtifact(full.version.ir)
  return result.ok ? { doc: result.value, graphHash: full.graphHash } : null
}

/**
 * A collision as a Problems entry, so the person learns why a step has no
 * file in Code. A stored file's entry navigates to that file (renaming it
 * frees the path); two steps sharing a path have no file to open, so the
 * entry names the path instead.
 */
export function stepCollisionProblems(collisions: readonly StepSourceCollision[]): Problem[] {
  return collisions.map(({ path, nodeIds, stored }) => ({
    file: stored ? path : '',
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    severity: 'warning',
    source: 'workflow',
    message: stored
      ? `A project file holds ${path}, so step ${nodeIds.join(', ')} has no file here. Rename the file to edit the step in Code.`
      : `Steps ${nodeIds.join(', ')} would all be ${path}; none of them is shown here. Edit them on the canvas.`,
  }))
}

/**
 * The document without `runtime.files`, the snapshot of the project files
 * the version was stored with. The file table is the truth and the save
 * folds it in again; sent back, the snapshot would re-seed a project whose
 * files were all deleted since, as if the document were an import. The
 * other runtime fields stay: their folding is the server's, which strips a
 * trigger-code or dependencies block once a file owns it and would lose
 * one that only this version still carries.
 */
export function withoutFileSnapshot(ir: ArtifactIR): ArtifactIR {
  if (ir.runtime?.files === undefined) return ir
  const { files: _files, ...runtime } = ir.runtime
  if (Object.keys(runtime).length > 0) return { ...ir, runtime }
  const { runtime: _runtime, ...rest } = ir
  // Dropping one optional key keeps the document the kind it was; TypeScript
  // widens a rest of a union to the keys the members share.
  return rest as ArtifactIR
}
