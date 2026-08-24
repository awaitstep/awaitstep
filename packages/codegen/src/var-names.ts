/** Escapes double quotes for embedding a display name in a generated string literal. */
export function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
