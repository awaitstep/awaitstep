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
}

export interface GenerationContextOptions {
  emitModules?: boolean
  /** nodeId → upstream var names, provided by the emitter from its topo order. */
  upstream?: Map<string, string[]>
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
 * A view of `ctx` with module emission disabled, sharing the same var names
 * and file sink. Container generators (loop, try/catch, branch, …) use it for
 * their children: container bodies introduce lexical bindings (loop item
 * variables, `err`, `_output`) and post-process their children's emitted text
 * (step-name suffixing, output capture), none of which survive extraction
 * into a standalone module — so container children always inline.
 */
export function inlineGenerationContext(ctx: GenerationContext): GenerationContext {
  return ctx.emitModules ? { ...ctx, emitModules: false } : ctx
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
  }
}
