/**
 * Splits `import` statements (single- or multi-line) from the rest of a code
 * block. Used to hoist user-trigger-code imports to the top of the generated
 * Worker file alongside imports from per-node generators.
 */
export function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split('\n')
  const imports: string[] = []
  const bodyLines: string[] = []
  let pendingImport: string[] | null = null

  for (const line of lines) {
    if (pendingImport) {
      pendingImport.push(line)
      if (/from\s+['"]/.test(line)) {
        imports.push(pendingImport.join('\n').trim())
        pendingImport = null
      }
    } else if (/^\s*import\s+/.test(line)) {
      // Complete on one line: `import x from "y"` or a side-effect
      // `import "./y";`. Only a truly open statement (multi-line named
      // imports) may consume following lines.
      if (/from\s+['"]/.test(line) || /^\s*import\s+['"][^'"]*['"];?\s*$/.test(line)) {
        imports.push(line.trim())
      } else {
        pendingImport = [line]
      }
    } else {
      bodyLines.push(line)
    }
  }

  if (pendingImport) {
    bodyLines.push(...pendingImport)
  }

  return { imports, body: bodyLines.join('\n') }
}
