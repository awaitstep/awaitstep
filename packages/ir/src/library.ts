// The Library's own rules: what an item's files may be called, how its
// versions are numbered and what it imports. Shared by the API (which
// enforces them) and the dashboard's Library IDE (which shows them).

import {
  inheritedWorkspaceRole,
  type Allowed,
  type ResolvedRoles,
  type WorkspaceRole,
} from './access.js'
import {
  MAX_PROJECT_FILE_PATH_LENGTH,
  PACKAGE_MANIFEST_PATH,
  PROJECT_FILE_EXTENSIONS,
  fileExtension,
  isReservedToolchainPath,
  isSafePathSegment,
  projectFileBytes,
} from './project-files.js'

export const LIBRARY_ITEM_KINDS = ['module', 'node'] as const
export type LibraryItemKind = (typeof LIBRARY_ITEM_KINDS)[number]

/** How workflow code and other library items import a module: `#modules/<slug>`. */
export const LIBRARY_MODULE_IMPORT_PREFIX = '#modules/'
/** The IR node type of a custom node: id-based, so a rename never breaks a stored graph. */
export const CUSTOM_NODE_TYPE_PREFIX = 'custom:'

export const LIBRARY_NODE_ICON_PATH = 'icon.svg'
export const LIBRARY_NODE_MANIFEST = 'node.json'
export const LIBRARY_NODE_TEMPLATE = 'template.ts'
export const LIBRARY_MODULE_ENTRY = 'index.ts'
/** The icon only ever renders through `<img>`; the cap keeps a listing cheap. */
export const MAX_LIBRARY_ICON_BYTES = 32_000
/** Items one workspace (or the project itself) may own: keeps the Library page one bounded read. */
export const MAX_LIBRARY_ITEMS_PER_OWNER = 200
/** Publishing a fourth version removes the oldest. */
export const MAX_LIBRARY_VERSIONS = 3
export const FIRST_LIBRARY_VERSION = '1.0.0'

export function customNodeType(itemId: string): string {
  return `${CUSTOM_NODE_TYPE_PREFIX}${itemId}`
}

// Plain release versions only: a prerelease would sort in ways the
// "latest published" rule does not need to explain.
const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/

export function isLibraryVersion(value: string): boolean {
  return SEMVER.test(value)
}

/** Negative, zero or positive as `a` is lower than, equal to or higher than `b`. */
export function compareLibraryVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function nextPatchVersion(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${(patch ?? 0) + 1}`
}

/** The version folder a node file sits in (`1.2.0/node.json` → `1.2.0`), or null. */
export function nodeVersionFolder(path: string): string | null {
  const slash = path.indexOf('/')
  if (slash === -1) return null
  const folder = path.slice(0, slash)
  return isLibraryVersion(folder) ? folder : null
}

const EXTENSIONS = PROJECT_FILE_EXTENSIONS as readonly string[]

/**
 * Why a path cannot be a file of a library item, or null when it can. A
 * module is a small package: code and data files, its `package.json` at the
 * root. A node is registry-shaped: `icon.svg` at the root and everything
 * else inside a version folder (`1.0.0/node.json`, `1.0.0/template.ts`).
 */
export function libraryFilePathError(kind: LibraryItemKind, path: string): string | null {
  if (path.length > MAX_PROJECT_FILE_PATH_LENGTH) {
    return `exceeds ${MAX_PROJECT_FILE_PATH_LENGTH} characters`
  }
  const segments = path.split('/')
  if (segments.some((segment) => !isSafePathSegment(segment))) {
    return 'contains an unsafe path segment'
  }
  if (kind === 'node') {
    if (path === LIBRARY_NODE_ICON_PATH) return null
    if (segments.length < 2 || !isLibraryVersion(segments[0]!)) {
      return `must be ${LIBRARY_NODE_ICON_PATH} or live in a version folder (1.0.0/…)`
    }
    if (isReservedToolchainPath(path)) {
      return 'is a toolchain file; a node declares its dependencies in node.json'
    }
  } else if (isReservedToolchainPath(path) && path !== PACKAGE_MANIFEST_PATH) {
    return path.toLowerCase().endsWith(PACKAGE_MANIFEST_PATH)
      ? 'must live at the module root'
      : 'is a toolchain file the deploy generates'
  }
  if (!EXTENSIONS.includes(fileExtension(path))) {
    return `must end in ${EXTENSIONS.map((e) => `.${e}`).join(', ')}`
  }
  return null
}

/**
 * Whether `source` opens as an SVG document: an optional XML declaration
 * and comments, then `<svg`. A linear scan, never a backtracking pattern:
 * a nested quantifier over comments made a 200-byte upload take seconds.
 */
function startsAsSvg(source: string): boolean {
  let at = 0
  const skipSpace = () => {
    while (at < source.length && /\s/.test(source[at]!)) at++
  }
  skipSpace()
  if (source.startsWith('<?xml', at)) {
    const end = source.indexOf('>', at)
    if (end === -1) return false
    at = end + 1
    skipSpace()
  }
  while (source.startsWith('<!--', at)) {
    const end = source.indexOf('-->', at + 4)
    if (end === -1) return false
    at = end + 3
    skipSpace()
  }
  return /^<svg[\s>]/i.test(source.slice(at, at + 5))
}

// What an SVG could run or load if it were ever shown other than through
// `<img>`: refused on write, so no stored icon carries it. Single-pass patterns only.
const ACTIVE_SVG_CONTENT = [
  /<script/i,
  /<foreignobject/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /<(?:iframe|object|embed)/i,
  // Encoded characters and data: URLs are how the patterns above get dodged.
  /&#/,
  /data:/i,
]

/** Why `source` cannot be a node's icon, or null. */
export function libraryIconError(source: string): string | null {
  if (projectFileBytes(source) > MAX_LIBRARY_ICON_BYTES) {
    return `${LIBRARY_NODE_ICON_PATH} exceeds ${MAX_LIBRARY_ICON_BYTES} bytes`
  }
  if (!startsAsSvg(source)) return `${LIBRARY_NODE_ICON_PATH} must be an SVG document`
  if (ACTIVE_SVG_CONTENT.some((pattern) => pattern.test(source))) {
    return `${LIBRARY_NODE_ICON_PATH} must not contain scripts, event handlers or embedded content`
  }
  return null
}

const SLUG = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const IMPORT_SPECIFIER = new RegExp(`(['"\`])#modules/(${SLUG})(?:/[^'"\`\\s]*)?\\1`, 'g')

/**
 * The module slugs the sources import as `#modules/<slug>` (or a subpath of
 * one), sorted and unique. A string match, not a parse: an import in a
 * comment counts too, which only ever makes a delete guard more careful.
 */
export function libraryImportSlugs(sources: Iterable<string>): string[] {
  const slugs = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(IMPORT_SPECIFIER)) slugs.add(match[2]!)
  }
  return [...slugs].sort()
}

export interface LibraryScaffoldInput {
  slug: string
  name: string
  description?: string
}

/** The files a new item starts with. */
export function libraryItemScaffold(
  kind: LibraryItemKind,
  input: LibraryScaffoldInput,
): { path: string; source: string }[] {
  if (kind === 'module') {
    const manifest = {
      name: input.slug,
      version: FIRST_LIBRARY_VERSION,
      type: 'module',
      ...(input.description ? { description: input.description } : {}),
      dependencies: {},
    }
    return [
      { path: PACKAGE_MANIFEST_PATH, source: `${JSON.stringify(manifest, null, 2)}\n` },
      {
        path: LIBRARY_MODULE_ENTRY,
        source: `// Workflows and nodes import this module from ${LIBRARY_MODULE_IMPORT_PREFIX}${input.slug}\nexport function hello(name: string): string {\n  return \`Hello, \${name}\`\n}\n`,
      },
    ]
  }
  const definition = {
    id: input.slug,
    name: input.name,
    version: FIRST_LIBRARY_VERSION,
    description: input.description ?? '',
    category: 'Utilities',
    configSchema: {},
    outputSchema: {},
  }
  return [
    {
      path: `${FIRST_LIBRARY_VERSION}/${LIBRARY_NODE_MANIFEST}`,
      source: `${JSON.stringify(definition, null, 2)}\n`,
    },
    {
      path: `${FIRST_LIBRARY_VERSION}/${LIBRARY_NODE_TEMPLATE}`,
      source: 'export default async function (ctx) {\n  return {}\n}\n',
    },
  ]
}

/**
 * The caller's role where an item lives: their workspace role for a
 * workspace's item, the role their project role gives for the project's
 * own. Null for a project item when they hold no project role (they reach it
 * through one of its workspaces, which may only use it).
 */
export function libraryOwnerRole(
  item: { workspaceId: string | null },
  roles: Pick<ResolvedRoles, 'projectRole' | 'workspaceRole'>,
): WorkspaceRole | null {
  return item.workspaceId === null ? inheritedWorkspaceRole(roles.projectRole) : roles.workspaceRole
}

export const LIBRARY_REASONS = {
  readOnly: 'From the project’s library. Only project members change it',
  needsEditor: 'Changing library items needs an Editor',
  projectMembersOnly: 'Only the project’s members can add to its library',
} as const

export interface LibraryItemCapabilities {
  /** Save, publish, restore, rename, delete. */
  edit: Allowed
}

/** What the caller may do with an item, by their role at its owner. */
export function libraryItemCapabilities(role: WorkspaceRole | null): LibraryItemCapabilities {
  const edit: Allowed =
    role === null
      ? { allowed: false, reason: LIBRARY_REASONS.readOnly }
      : role === 'viewer'
        ? { allowed: false, reason: LIBRARY_REASONS.needsEditor }
        : { allowed: true }
  return { edit }
}

/**
 * Whether the caller may add an item where they stand, by their role there
 * (a workspace role, or the role the project gives): null means they reach
 * the project only through a workspace, which may use its library, not add to it.
 */
export function libraryCreateCapability(role: WorkspaceRole | null): Allowed {
  if (role === null) return { allowed: false, reason: LIBRARY_REASONS.projectMembersOnly }
  return libraryItemCapabilities(role).edit
}
