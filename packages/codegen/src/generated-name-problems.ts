import type { ValidationError, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { INLINE_TAKEN_NAMES } from '@awaitstep/ir'
import { computeVarNames } from './context.js'
import { bindersAcrossMerges, blockChain, containerArms } from './dag.js'
import { boundVarNames, exportPlan } from './graph/export-plan.js'
import { GenerateInputError } from './errors.js'
import { extractImports, importBindings } from './imports.js'
import { topLevelDeclarations } from './inline-declarations.js'
import { CORE_RUNTIME_IMPORT } from './runtime.js'

const INLINE_TAKEN = new Set(INLINE_TAKEN_NAMES)

/**
 * Where a workflow's own names would clash with the names its generated code
 * binds:
 * - a loop item named like a node inside that loop whose variable holds a
 *   value (the node's `const` hides the item, and reading the item throws);
 * - an inline step that declares, at its top level, a name another node
 *   binds in its scope — before it, around it, or after it in the same
 *   block ({@link scopeClashes}). The same name in a sibling arm is fine;
 * - an inline step that declares or imports, at its top level, a name the
 *   generated code binds around it ({@link INLINE_TAKEN_NAMES}). Inline code
 *   runs in the graph's own scope, so the declaration breaks every
 *   generated line after it. Importing a runtime name from
 *   `#awaitstep/runtime` under its own name is fine: it merges with the
 *   generated import.
 */
export function generatedNameProblems(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'> & { kind?: string },
): ValidationError[] {
  const problems: ValidationError[] = []
  const varNames = computeVarNames(ir.nodes)
  const bound = boundVarNames(ir, varNames)
  const arms = containerArms(ir as WorkflowIR)
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))

  for (const [nodeId, boundNames] of bound) {
    const node = nodes.get(nodeId)!
    for (const block of blockChain(arms, nodeId)) {
      const loop = nodes.get(block.owner)
      if (loop?.type !== 'loop' || loop.data.loopType !== 'forEach') continue
      const itemVar = String(loop.data.itemVar ?? 'item')
      if (!boundNames.includes(itemVar)) continue
      problems.push({
        path: `nodes.${loop.id}.data.itemVar`,
        nodeId: loop.id,
        message: `Loop "${loop.name}" item name \`${itemVar}\` is also step "${node.name}" inside this loop. Rename one.`,
      })
    }
  }

  problems.push(...scopeClashes(ir, varNames))

  for (const node of ir.nodes) {
    if (node.type !== 'step' || node.data.inline !== true) continue
    const { imports, body } = extractImports(String(node.data.code ?? ''))
    // Each name the step binds, and the module when an import binds it.
    const declared = new Map<string, string | undefined>()
    for (const name of topLevelDeclarations(body)) declared.set(name, undefined)
    for (const statement of imports) {
      for (const binding of importBindings(statement)) {
        const merges =
          binding.specifier === CORE_RUNTIME_IMPORT && binding.imported === binding.local
        if (!merges) declared.set(binding.local, binding.specifier)
      }
    }
    for (const [name, specifier] of declared) {
      if (!INLINE_TAKEN.has(name)) continue
      problems.push({
        path: `nodes.${node.id}.data.code`,
        nodeId: node.id,
        message:
          specifier === undefined
            ? `Inline step "${node.name}" declares \`${name}\`, which generated code uses. Rename it.`
            : `Inline step "${node.name}" imports \`${name}\` from "${specifier}", which generated code uses. Rename it with \`as\`.`,
      })
    }
  }
  return problems
}

const isInline = (node: WorkflowNode): boolean => node.type === 'step' && node.data.inline === true

type Graph = Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>

/**
 * A name an inline step declares that another node already binds where the
 * step runs, or that a later node binds again in the step's scope. Inline code
 * shares the body's scope: in one block both \`const\`s do not parse, and in a
 * nested one the inner name hides the outer for the whole block, so a read
 * before the inline step throws. Reported on the inline step. A graph the
 * sort refuses (a cycle) is reported elsewhere and skipped here.
 */
function scopeClashes(ir: Graph, names: Map<string, string>): ValidationError[] {
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))
  const script = (ir as { kind?: string }).kind === 'script'
  const problems = new Map<string, ValidationError>()
  try {
    const bound = boundVarNames(ir, names)
    // A clash needs one name bound by two nodes, one of them inline: only
    // the nodes binding such a name are looked at.
    const binderCount = new Map<string, number>()
    const inlineNames = new Set<string>()
    for (const [id, declared] of bound) {
      for (const name of declared) {
        binderCount.set(name, (binderCount.get(name) ?? 0) + 1)
        if (isInline(nodes.get(id)!)) inlineNames.add(name)
      }
    }
    const shared = (name: string) => inlineNames.has(name) && binderCount.get(name)! > 1
    const candidates = [...bound].filter(([, declared]) => declared.some(shared)).map(([id]) => id)
    if (candidates.length === 0) return []
    const plan = script ? exportPlan(ir) : new Map()
    const binderOf = bindersAcrossMerges(
      ir as WorkflowIR,
      bound,
      (node) => plan.has(node.id),
      candidates,
    )
    for (const nodeId of candidates) {
      const node = nodes.get(nodeId)!
      for (const name of bound.get(nodeId)!.filter(shared)) {
        for (const binderId of binderOf(nodeId, name)) {
          if (binderId === nodeId) continue
          const earlier = nodes.get(binderId)!
          const [inline, other] = isInline(node) ? [node, earlier] : [earlier, node]
          if (!isInline(inline)) continue
          const key = `${inline.id}\0${name}\0${other.id}`
          if (problems.has(key)) continue
          problems.set(key, {
            path: `nodes.${inline.id}.data.code`,
            nodeId: inline.id,
            message: `Inline step "${inline.name}" declares \`${name}\`, which step "${other.name}" also binds. Rename one.`,
          })
        }
      }
    }
  } catch (error) {
    if (!(error instanceof GenerateInputError)) throw error
  }
  return [...problems.values()]
}
