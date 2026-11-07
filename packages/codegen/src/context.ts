import { buildVarNameMap, sanitizeIdentifier } from './sanitize.js'
import type { GeneratedFile } from './types.js'

/**
 * Per-generation state threaded through code generators. Replaces the old
 * module-global var-name map so concurrent and nested generations can never
 * observe each other's state.
 */
export interface GenerationContext {
  /** JavaScript variable name for a node's step result. */
  varName(nodeId: string): string
  /**
   * When true, code-bearing generators emit standalone module files via
   * {@link addFile} and return an import-calling snippet; when false they
   * inline user code (the legacy single-file shape).
   */
  readonly emitModules: boolean
  /** Module files collected during this generation (empty unless emitModules). */
  readonly files: GeneratedFile[]
  addFile(file: GeneratedFile): void
  /**
   * Variable names of nodes topologically upstream of the given node — the
   * exact set an extracted module receives as `inputs`.
   */
  upstreamVars(nodeId: string): string[]
  /**
   * Whether the node's step output is consumed anywhere the generator can
   * see (downstream references, exports). Absent — or returning true — means
   * the output must be stored; generators may only lean a step's return
   * when this explicitly answers false. Emitters set it for nodes where the
   * analysis is sound (top-level steps); container children must always
   * store, since container glue references their vars invisibly.
   */
  isOutputConsumed?(nodeId: string): boolean
  /** True inside a container's arm: the node is emitted in a block, not at the top level. */
  readonly inContainer?: boolean
  /**
   * What the enclosing container binds for its children, as `inputs` key →
   * expression at the call site: a loop's item and index, a catch arm's error.
   */
  readonly blockInputs?: Readonly<Record<string, string>>
}

export interface GenerationContextOptions {
  emitModules?: boolean
  /** nodeId → upstream var names, provided by the emitter from its topo order. */
  upstream?: Map<string, string[]>
  isOutputConsumed?(nodeId: string): boolean
}

/**
 * Pure derivation of the node-id → variable-name map (variable names come
 * from node display names, deduplicated). Exposed separately so non-codegen
 * consumers (e.g. editor type-definition generation) can reuse the exact
 * naming scheme without constructing a context.
 */
export function computeVarNames(nodes: { id: string; name: string }[]): Map<string, string> {
  return buildVarNameMap(nodes)
}

/**
 * The context a container hands its children: the same var names and file
 * sink, the container's bindings added to `inputs`, and no leaning — the
 * container's glue (a loop's value capture, a parallel's results) reads the
 * children's vars outside anything the consumption scan can see.
 */
export function childContext(
  ctx: GenerationContext,
  blockInputs: Readonly<Record<string, string>> = {},
): GenerationContext {
  return {
    ...ctx,
    inContainer: true,
    blockInputs: { ...ctx.blockInputs, ...blockInputs },
    isOutputConsumed: () => true,
  }
}

export function createGenerationContext(
  nodes: { id: string; name: string }[],
  options?: GenerationContextOptions,
): GenerationContext {
  const names = computeVarNames(nodes)
  const files: GeneratedFile[] = []
  const upstream = options?.upstream
  return {
    varName(nodeId: string): string {
      // Truthiness (not just nullish) check for exact parity with the old
      // global-map fallback: an empty mapped name falls back to the id.
      const name = names.get(nodeId)
      return name ? name : sanitizeIdentifier(nodeId)
    },
    emitModules: options?.emitModules ?? false,
    files,
    addFile(file: GeneratedFile): void {
      files.push(file)
    },
    upstreamVars(nodeId: string): string[] {
      return upstream?.get(nodeId) ?? []
    },
    ...(options?.isOutputConsumed && { isOutputConsumed: options.isOutputConsumed }),
  }
}
