import type { WorkflowNode } from '@awaitstep/ir'
import { stepSourcePath } from '@awaitstep/ir'
import { GenerateInputError, type GeneratedFile } from './internal.js'

/**
 * Refuses a bundle whose project files include one at a step's own path: the
 * step's module is emitted there, and two files cannot share it. Named after
 * the step, so the person knows which file to rename or delete.
 */
export function assertStepPathsFree(ir: {
  nodes: readonly WorkflowNode[]
  runtime?: { files?: readonly { path: string }[] }
}): void {
  const stored = new Set((ir.runtime?.files ?? []).map((file) => file.path))
  for (const node of ir.nodes) {
    if (node.type !== 'step' || node.data.inline === true) continue
    const path = stepSourcePath(node.id)
    if (stored.has(path)) {
      throw new GenerateInputError(
        `Project file "${path}" is where the module of step "${node.name}" goes — rename or delete the file`,
        'provider',
      )
    }
  }
}

/**
 * The import an entry writes for a module file: its default-import binding
 * (a step's `$<var>`, or `$<base>` for a generated `nodes/<base>.ts`) from the
 * compiled `.js` path, relative to the importing file's directory.
 */
export function moduleImportLine(file: GeneratedFile, prefix: string): string {
  const compiled = file.path.replace(/\.ts$/, '.js')
  if (file.binding) return `import ${file.binding} from "${prefix}${compiled}";`
  const match = /^nodes\/([A-Za-z0-9_]+)\.ts$/.exec(file.path)
  if (!match) throw new Error(`Generated module has unexpected path: ${file.path}`)
  return `import $${match[1]} from "${prefix}${compiled}";`
}

/**
 * Where a node's module landed in the bundle, or null when it has none: a
 * step's own `steps/<id>.ts`, a template node's `nodes/<var>.ts`.
 */
export function modulePathOf(
  files: readonly GeneratedFile[],
  node: Pick<WorkflowNode, 'id'>,
  varName: string,
): string | null {
  const candidates = [stepSourcePath(node.id), `nodes/${varName}.ts`]
  const found = files.find((file) => file.role === 'module' && candidates.includes(file.path))
  return found ? found.path : null
}
