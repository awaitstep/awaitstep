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
  const extension = name.slice(dot + 1).toLowerCase()
  return Object.hasOwn(LANGUAGE_BY_EXTENSION, extension)
    ? LANGUAGE_BY_EXTENSION[extension]!
    : 'plaintext'
}

/** Every file path in a tree. */
export function treeFilePaths(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node.path] : treeFilePaths(node.children),
  )
}

export type TreeSectionId = 'project' | 'generated'

export interface TreeRow {
  /** Unique across both sections: `section:project`, `project:lib/a.ts`. */
  key: string
  kind: 'section' | 'dir' | 'file'
  section: TreeSectionId
  path: string
  name: string
  /** 0 for a section header, 1 for its top-level entries. */
  depth: number
  parentKey: string | null
  /** Sections and folders only. */
  expanded: boolean
  /** A project file the viewer may rename, delete or open the menu of. */
  editable: boolean
  node?: TreeFile
}

export function rowKey(section: TreeSectionId, path: string): string {
  return `${section}:${path}`
}

export function sectionKey(section: TreeSectionId): string {
  return `section:${section}`
}

export interface TreeSectionInput {
  id: TreeSectionId
  label: string
  nodes: readonly TreeNode[]
}

/**
 * The tree as the visible, ordered list of rows keyboard navigation walks.
 * `collapsed` holds row keys the user folded; `forceOpen` keys stay open
 * regardless (the path to an inline create row).
 */
export function flattenTreeRows(
  sections: readonly TreeSectionInput[],
  collapsed: ReadonlySet<string>,
  options: { forceOpen?: ReadonlySet<string>; isEditable?: (node: TreeFile) => boolean } = {},
): TreeRow[] {
  const rows: TreeRow[] = []
  const isOpen = (key: string) => options.forceOpen?.has(key) || !collapsed.has(key)

  function walk(section: TreeSectionId, nodes: readonly TreeNode[], depth: number, parent: string) {
    for (const node of nodes) {
      const key = rowKey(section, node.path)
      if (node.kind === 'dir') {
        const expanded = isOpen(key)
        rows.push({
          key,
          kind: 'dir',
          section,
          path: node.path,
          name: node.name,
          depth,
          parentKey: parent,
          expanded,
          editable: false,
        })
        if (expanded) walk(section, node.children, depth + 1, key)
      } else {
        rows.push({
          key,
          kind: 'file',
          section,
          path: node.path,
          name: node.name,
          depth,
          parentKey: parent,
          expanded: false,
          editable: section === 'project' && (options.isEditable?.(node) ?? true),
          node,
        })
      }
    }
  }

  for (const section of sections) {
    const key = sectionKey(section.id)
    const expanded = isOpen(key)
    rows.push({
      key,
      kind: 'section',
      section: section.id,
      path: '',
      name: section.label,
      depth: 0,
      parentKey: null,
      expanded,
      editable: false,
    })
    if (expanded) walk(section.id, section.nodes, 1, key)
  }
  return rows
}

export type TreeIntent =
  | { type: 'focus'; key: string }
  | { type: 'expand' | 'collapse' | 'toggle' | 'open' | 'select'; key: string }
  | { type: 'rename' | 'delete' | 'menu'; key: string }
  | { type: 'escape' }

export interface TreeKeyEvent {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/**
 * What a key press does in the tree, as data. Rename, delete and the row menu
 * apply to editable rows only; everything else is the standard tree pattern
 * (arrows move, → / ← open, close and step between levels).
 */
export function treeKeyIntent(
  rows: readonly TreeRow[],
  focusedKey: string | null,
  event: TreeKeyEvent,
): TreeIntent | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  const index = rows.findIndex((row) => row.key === focusedKey)
  const row = rows[index]
  const first = rows[0]
  const last = rows[rows.length - 1]
  const hasChildren = (r: TreeRow) => rows.some((other) => other.parentKey === r.key)

  switch (event.key) {
    case 'ArrowDown':
      return row
        ? rows[index + 1]
          ? { type: 'focus', key: rows[index + 1]!.key }
          : null
        : focusOf(first)
    case 'ArrowUp':
      return row
        ? rows[index - 1]
          ? { type: 'focus', key: rows[index - 1]!.key }
          : null
        : focusOf(first)
    case 'Home':
      return focusOf(first)
    case 'End':
      return focusOf(last)
    case 'ArrowRight':
      if (!row || row.kind === 'file') return null
      if (!row.expanded) return { type: 'expand', key: row.key }
      return hasChildren(row) ? { type: 'focus', key: rows[index + 1]!.key } : null
    case 'ArrowLeft':
      if (!row) return null
      if (row.kind !== 'file' && row.expanded) return { type: 'collapse', key: row.key }
      return row.parentKey ? { type: 'focus', key: row.parentKey } : null
    case 'Enter':
      if (!row) return null
      return { type: row.kind === 'file' ? 'open' : 'toggle', key: row.key }
    case ' ':
      return row && row.kind !== 'section' ? { type: 'select', key: row.key } : null
    case 'F2':
      return row?.editable ? { type: 'rename', key: row.key } : null
    case 'Delete':
    case 'Backspace':
      return row?.editable ? { type: 'delete', key: row.key } : null
    case 'ContextMenu':
      return row?.editable ? { type: 'menu', key: row.key } : null
    case 'F10':
      return event.shiftKey && row?.editable ? { type: 'menu', key: row.key } : null
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}

function focusOf(row: TreeRow | undefined): TreeIntent | null {
  return row ? { type: 'focus', key: row.key } : null
}

/**
 * Where focus goes once `key` is gone: the next row, or the previous one when
 * it was the last (a section header never takes focus from a file's neighbours).
 */
export function focusAfterRemoval(rows: readonly TreeRow[], key: string): string | null {
  const index = rows.findIndex((row) => row.key === key)
  if (index === -1) return null
  const next = rows[index + 1]
  if (next && next.kind !== 'section') return next.key
  return rows[index - 1]?.key ?? null
}
