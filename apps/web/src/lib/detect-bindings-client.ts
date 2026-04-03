export type ClientBindingType = 'kv' | 'd1' | 'r2' | 'queue'

export interface ClientBinding {
  name: string
  type: ClientBindingType
}

const BINDING_PATTERNS: Array<{ pattern: RegExp; type: ClientBindingType }> = [
  { pattern: /env\.(KV\w*)/g, type: 'kv' },
  { pattern: /env\.(DB\w*)/g, type: 'd1' },
  { pattern: /env\.(BUCKET\w*)/g, type: 'r2' },
  { pattern: /env\.(QUEUE\w*)/g, type: 'queue' },
]

export function detectBindingsFromNodes(
  nodes: Array<{ data: { irNode: { data: Record<string, unknown> } } }>,
): ClientBinding[] {
  const seen = new Set<string>()
  const bindings: ClientBinding[] = []

  for (const node of nodes) {
    for (const value of Object.values(node.data.irNode.data)) {
      if (typeof value !== 'string') continue

      for (const { pattern, type } of BINDING_PATTERNS) {
        const regex = new RegExp(pattern.source, 'g')
        let match: RegExpExecArray | null
        while ((match = regex.exec(value)) !== null) {
          const key = `${type}:${match[1]!}`
          if (seen.has(key)) continue
          seen.add(key)
          bindings.push({ name: match[1]!, type })
        }
      }
    }
  }

  return bindings
}
