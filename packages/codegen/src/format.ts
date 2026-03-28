export function indent(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return code
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n')
}
