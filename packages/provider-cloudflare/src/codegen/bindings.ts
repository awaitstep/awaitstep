import type { WorkflowIR } from '@awaitstep/ir'

export type BindingType = 'kv' | 'd1' | 'r2' | 'queue' | 'secret' | 'variable' | 'service'

export interface BindingRequirement {
  name: string
  type: BindingType
  source: 'env-binding' | 'code-scan'
  nodeId?: string
  resourceId?: string
}

const BINDING_PATTERNS: Array<{ pattern: RegExp; type: BindingType }> = [
  { pattern: /env\.(KV\w*)/g, type: 'kv' },
  { pattern: /env\.(DB\w*)/g, type: 'd1' },
  { pattern: /env\.(BUCKET\w*)/g, type: 'r2' },
  { pattern: /env\.(QUEUE\w*)/g, type: 'queue' },
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
          add({ name: match[1]!, type, source: 'code-scan', nodeId: node.id })
        }
      }
    }
  }

  return bindings
}

export function detectBindingsFromSource(source: string): BindingRequirement[] {
  const seen = new Set<string>()
  const bindings: BindingRequirement[] = []

  for (const { pattern, type } of BINDING_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g')
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      const key = `${type}:${match[1]!}`
      if (seen.has(key)) continue
      seen.add(key)
      bindings.push({ name: match[1]!, type, source: 'code-scan' })
    }
  }

  return bindings
}
