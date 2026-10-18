import type { GeneratedFileRole } from '@awaitstep/codegen'

export interface TreeFile {
  kind: 'file'
  name: string
  path: string
  role: GeneratedFileRole
}

export interface TreeDir {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

export type TreeNode = TreeFile | TreeDir

/**
 * Drops empty and `.` segments so `./src//a.ts` and `src/a.ts` are one file.
 * Bundle paths are already clean (validateBundle rejects anything else); this
 * exists for user-typed input such as the `?file=` deep link.
 */
export function normalizeBundlePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')
}

export function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/**
 * Nests a flat bundle into an explorer tree: directories before files, each
 * level sorted case-insensitively. A path listed twice keeps its last role.
 */
export function buildFileTree(
  files: ReadonlyArray<{ path: string; role: GeneratedFileRole }>,
): TreeNode[] {
  const byPath = new Map<string, TreeFile>()
  for (const file of files) {
    const path = normalizeBundlePath(file.path)
    if (!path) continue
    byPath.set(path, { kind: 'file', name: basename(path), path, role: file.role })
  }

  const root: TreeDir = { kind: 'dir', name: '', path: '', children: [] }
  for (const file of byPath.values()) {
    const segments = file.path.split('/')
    let dir = root
    for (let depth = 0; depth < segments.length - 1; depth++) {
      const dirPath = segments.slice(0, depth + 1).join('/')
      let next = dir.children.find(
        (child): child is TreeDir => child.kind === 'dir' && child.path === dirPath,
      )
      if (!next) {
        next = { kind: 'dir', name: segments[depth], path: dirPath, children: [] }
        dir.children.push(next)
      }
      dir = next
    }
    dir.children.push(file)
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort(compareNodes)
  for (const node of nodes) {
    if (node.kind === 'dir') sortTree(node.children)
  }
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  return (
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
    a.name.localeCompare(b.name, 'en')
  )
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  css: 'css',
  html: 'html',
}

/** Monaco language id for a bundle path; plaintext when the extension is unknown. */
export function fileLanguage(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'plaintext'
  return LANGUAGE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'plaintext'
}
