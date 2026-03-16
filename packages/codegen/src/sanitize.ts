export function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
}

/**
 * Build a map from node ID to a unique, human-readable variable name
 * derived from the node's name (not its ID).
 */
export function buildVarNameMap(nodes: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  const usedNames = new Map<string, number>()

  for (const node of nodes) {
    let base = sanitizeIdentifier(node.name)
    if (!base) base = sanitizeIdentifier(node.id)

    const count = usedNames.get(base) ?? 0
    usedNames.set(base, count + 1)
    const varName = count === 0 ? base : `${base}_${count + 1}`
    map.set(node.id, varName)
  }

  return map
}

export function deduplicateStepNames(names: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const name of names) {
    const count = counts.get(name) ?? 0
    counts.set(name, count + 1)
    if (count === 0) {
      result.set(name, name)
    } else {
      result.set(`${name}_${count}`, `${name} (${count})`)
    }
  }

  return result
}
