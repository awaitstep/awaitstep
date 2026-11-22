import {
  expressionRefNodeId,
  findExpressions,
  type ArtifactIR,
  type NodeId,
  type WorkflowIR,
  type WorkflowNode,
} from '@awaitstep/ir'
import { maskNonCode } from '../code-text.js'
import { computeVarNames } from '../context.js'
import { moduleInputReads } from '../module-inputs.js'
import { inlineStepNames } from '../inline-declarations.js'
import { bindersAcrossMerges } from '../dag.js'
import { GenerateInputError } from '../errors.js'
import { boundVarNames } from './export-plan.js'

/** One place another node reads a node's value. */
export interface NodeReader {
  nodeId: NodeId
  nodeName: string
  /** The data field holding the read: `message`, `branches[0].condition`, `code`. */
  field: string
  /** What the read looks like where it is written: `{{say_hello.result}}`, `inputs.say_hello`. */
  text: string
  /**
   * The read names the node's variable name rather than its id. Such a read
   * follows the name: if another node takes it over (a `_2` suffix moving
   * after a removal), the read silently reads that node instead.
   */
  byName: boolean
}

/**
 * The fields of builtin nodes that hold code (JS expressions or statements)
 * rather than text: a node's variable name appears in them as a bare
 * identifier. Template and custom node fields are text, read through
 * `{{…}}` only.
 */
const CODE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  http_request: ['body'],
  loop: ['collection', 'condition'],
  break: ['condition'],
  sub_workflow: ['input'],
  sub_script: ['body'],
}
const BRANCH_CODE_KEY = 'condition'

/**
 * Every place another node reads `nodeId`'s value: `{{…}}` references by
 * id or variable name, a step module's `inputs.<name>` reads, an inline
 * step's bare name, and the bare name in a code field (branch conditions,
 * loop collections, request bodies). An inline step's value is also every
 * name its code declares at its top level, read the same ways. A module that reads `inputs` whole is
 * not listed, since nothing says it reads this name. Text that merely
 * contains the name (a message, a comment, a string) is not a read.
 */
export function nodeReaders(
  ir: Pick<ArtifactIR, 'nodes'> & Partial<Pick<ArtifactIR, 'edges' | 'entryNodeId'>>,
  nodeId: NodeId,
): NodeReader[] {
  const varNames = computeVarNames(ir.nodes)
  const varName = varNames.get(nodeId)
  if (varName === undefined) return []
  const allIds = new Set(ir.nodes.map((n) => n.id))
  const idByName = new Map([...varNames].map(([id, name]) => [name, id]))
  // An inline step's value is the names it declares; its variable name
  // counts too, as the legacy `const <VarName> = …` and `{{…}}` refs use it.
  const target = ir.nodes.find((n) => n.id === nodeId)
  const names = [...new Set([varName, ...(target ? inlineStepNames(target) : [])])]
  // A read of a name the step declares (not its variable name) holds only
  // where this step's binding is the one in scope: a generic name (`data`,
  // `result`) elsewhere is another binding. Checked after the text pass, for
  // the nodes that read one.
  const declaredReads = new Map<NodeReader, string>()

  const readers: NodeReader[] = []
  for (const node of ir.nodes) {
    if (node.id === nodeId) continue
    // `byName`: the read names the node's variable name, which another node
    // can take over; a name an inline step declares is its own.
    const add = (field: string, text: string, byName = true) =>
      readers.push({ nodeId: node.id, nodeName: node.name, field, text, byName })
    const addRead = (field: string, text: string, name: string) => {
      add(field, text, name === varName)
      if (name !== varName) declaredReads.set(readers[readers.length - 1]!, name)
    }

    for (const found of findExpressions(node)) {
      if (expressionRefNodeId(found.ast.ref, allIds, idByName) !== nodeId) continue
      add(
        found.objectKey === undefined
          ? fieldPath(found.dataKey, found.arrayIndex, found.arrayKey)
          : `${found.dataKey}.${found.objectKey}`,
        found.raw,
        !allIds.has(found.ast.ref),
      )
    }
    // An inline step that declares the name itself reads its own.
    const own = new Set(inlineStepNames(node))
    for (const [field, code] of codeFields(node)) {
      for (const name of names) {
        if (!own.has(name) && namesIdentifier(code, name)) addRead(field, name, name)
      }
    }
    if (node.type === 'step' && node.data.inline !== true) {
      const code = typeof node.data.code === 'string' ? node.data.code : ''
      const reads = moduleInputReads(code).names
      for (const name of names) {
        if (reads.has(name)) addRead('code', `inputs.${name}`, name)
      }
    }
  }
  if (declaredReads.size === 0) return readers
  const sees = declaredNameScope(ir, nodeId, [
    ...new Set([...declaredReads.keys()].map((reader) => reader.nodeId)),
  ])
  return readers.filter((reader) => {
    const name = declaredReads.get(reader)
    return name === undefined || sees(reader.nodeId, name)
  })
}

/**
 * Whether `binderId`'s declared name is the binding in scope at a node — in
 * the graph as it is or along any way into a merge. Only the `candidates`
 * (nodes whose text reads one of the names) are answered. Without edges, or
 * for a graph the sort refuses, every node may see it.
 */
function declaredNameScope(
  ir: Pick<ArtifactIR, 'nodes'> & Partial<Pick<ArtifactIR, 'edges' | 'entryNodeId'>>,
  binderId: string,
  candidates: string[],
): (nodeId: string, name: string) => boolean {
  if (!ir.edges || !ir.entryNodeId) return () => true
  const graph = ir as unknown as WorkflowIR
  try {
    const bound = boundVarNames(graph, computeVarNames(ir.nodes))
    const binderOf = bindersAcrossMerges(graph, bound, () => false, candidates)
    return (nodeId, name) => binderOf(nodeId, name).includes(binderId)
  } catch (error) {
    if (error instanceof GenerateInputError) return () => true
    throw error
  }
}

function fieldPath(key: string, index?: number, arrayKey?: string): string {
  if (index === undefined) return key
  return arrayKey === undefined ? `${key}[${index}]` : `${key}[${index}].${arrayKey}`
}

/** The node's code-bearing strings, by field path. */
function codeFields(node: WorkflowNode): Array<[string, string]> {
  const fields: Array<[string, string]> = []
  if (node.type === 'step' && node.data.inline === true && typeof node.data.code === 'string') {
    fields.push(['code', node.data.code])
  }
  for (const key of CODE_FIELDS[node.type] ?? []) {
    const value = node.data[key]
    if (typeof value === 'string') fields.push([key, value])
  }
  if (node.type === 'branch' && Array.isArray(node.data.branches)) {
    node.data.branches.forEach((arm, index) => {
      const condition = (arm as Record<string, unknown> | null)?.[BRANCH_CODE_KEY]
      if (typeof condition === 'string') {
        fields.push([fieldPath('branches', index, BRANCH_CODE_KEY), condition])
      }
    })
  }
  return fields
}

const EXPRESSION_RE = /\{\{[^{}]*\}\}/g

/**
 * `name` as a whole identifier in code, outside strings, comments and
 * `{{…}}` (counted on their own), and not as a property (`x.name`).
 */
function namesIdentifier(code: string, name: string): boolean {
  const masked = maskNonCode(code.replace(EXPRESSION_RE, (match) => ' '.repeat(match.length)))
  const word = /[A-Za-z_$][\w$]*/g
  for (const match of masked.matchAll(word)) {
    if (match[0] !== name) continue
    let before = match.index! - 1
    while (before >= 0 && (masked[before] === ' ' || masked[before] === '\t')) before -= 1
    if (masked[before] === '.' && masked[before - 1] !== '.') continue
    return true
  }
  return false
}
