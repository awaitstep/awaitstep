export function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
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
