import {
  expressionRefNodeId,
  findExpressions,
  type ArtifactIR,
  type NodeId,
  type WorkflowNode,
} from '@awaitstep/ir'
import { maskNonCode } from '../code-text.js'
import { computeVarNames } from '../context.js'
import { moduleInputReads } from '../module-inputs.js'

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
 * loop collections, request bodies). A module that reads `inputs` whole is
 * not listed, since nothing says it reads this name. Text that merely
 * contains the name (a message, a comment, a string) is not a read.
 */
export function nodeReaders(ir: Pick<ArtifactIR, 'nodes'>, nodeId: NodeId): NodeReader[] {
  const varNames = computeVarNames(ir.nodes)
  const varName = varNames.get(nodeId)
  if (varName === undefined) return []
  const allIds = new Set(ir.nodes.map((n) => n.id))
  const idByName = new Map([...varNames].map(([id, name]) => [name, id]))

  const readers: NodeReader[] = []
  for (const node of ir.nodes) {
    if (node.id === nodeId) continue
    const add = (field: string, text: string, byName = true) =>
      readers.push({ nodeId: node.id, nodeName: node.name, field, text, byName })

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
    for (const [field, code] of codeFields(node)) {
      if (namesIdentifier(code, varName)) add(field, varName)
    }
    if (node.type === 'step' && node.data.inline !== true) {
      const code = typeof node.data.code === 'string' ? node.data.code : ''
      if (moduleInputReads(code).names.has(varName)) add('code', `inputs.${varName}`)
    }
  }
  return readers
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
