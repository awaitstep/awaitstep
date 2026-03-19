import type { WorkflowIR } from '@awaitstep/ir'

export type BindingType = 'kv' | 'd1' | 'r2' | 'secret' | 'variable' | 'service'

export interface BindingRequirement {
  name: string
  type: BindingType
  source: 'env-binding' | 'code-scan'
  nodeId?: string
}

const BINDING_PATTERNS: Array<{ pattern: RegExp; type: BindingType }> = [
  { pattern: /env\.KV_(\w+)/g, type: 'kv' },
  { pattern: /env\.DB_(\w+)/g, type: 'd1' },
  { pattern: /env\.BUCKET_(\w+)/g, type: 'r2' },
]

export function detectBindings(
  ir: WorkflowIR,
  envBindings?: Array<{ name: string; type: string }>,
): BindingRequirement[] {
  const seen = new Set<string>()
  const bindings: BindingRequirement[] = []

  function add(req: BindingRequirement) {
    const key = `${req.type}:${req.name}`
    if (seen.has(key)) return
    seen.add(key)
    bindings.push(req)
  }

  if (envBindings) {
    for (const b of envBindings) {
      add({ name: b.name, type: b.type as BindingType, source: 'env-binding' })
    }
  }

  for (const node of ir.nodes) {
    const codeStrings: string[] = []
    for (const v of Object.values(node.data)) {
      if (typeof v === 'string') codeStrings.push(v)
    }

    for (const code of codeStrings) {
      for (const { pattern, type } of BINDING_PATTERNS) {
        const regex = new RegExp(pattern.source, 'g')
        let match: RegExpExecArray | null
        while ((match = regex.exec(code)) !== null) {
          const fullName = match[0].split('.')[1]!
          add({ name: fullName, type, source: 'code-scan', nodeId: node.id })
        }
      }
    }
  }

  return bindings
}
