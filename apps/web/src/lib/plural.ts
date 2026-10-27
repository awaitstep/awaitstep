/** "key" or "keys": the noun alone, for when the count is shown apart from it. */
export function pluralNoun(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many
}

/** "1 project key", "5 variables": a count with its noun. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${pluralNoun(count, one, many)}`
}
