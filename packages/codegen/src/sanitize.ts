export function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
}

const EXPORT_PREFIX_RE = /^EXPORT_(.+)$/

/**
 * In script mode, a node whose display name starts with `EXPORT_` is exposed
 * on the `graph` object the user's fetch handler receives. The prefix is a
 * pure marker — it's stripped from the resulting var/key name.
 */
export function isExportedName(name: string): boolean {
  return EXPORT_PREFIX_RE.test(name)
}

/**
 * Strip the `EXPORT_` marker from a node name so the var/key is the clean
 * identifier the user wrote (e.g. `EXPORT_DirectMail` → `DirectMail`).
 * Returns the original name if no marker is present.
 */
export function stripExportPrefix(name: string): string {
  const m = EXPORT_PREFIX_RE.exec(name)
  return m ? m[1]! : name
}

/**
 * Build a map from node ID to a unique, human-readable variable name
 * derived from the node's name (not its ID).
 */
export function buildVarNameMap(nodes: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  const usedNames = new Map<string, number>()

  for (const node of nodes) {
    // Drop the `EXPORT_` marker (if any) before sanitizing — the prefix is a
    // marker, not part of the identifier.
    let base = sanitizeIdentifier(stripExportPrefix(node.name))
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
