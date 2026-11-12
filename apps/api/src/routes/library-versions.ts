import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import {
  LIBRARY_NODE_ICON_PATH,
  LIBRARY_NODE_MANIFEST,
  MAX_LIBRARY_VERSIONS,
  PACKAGE_MANIFEST_PATH,
  isLibraryVersion,
  nextPatchVersion,
  projectFileBytes,
} from '@awaitstep/ir'
import type {
  DatabaseAdapter,
  LibraryFile,
  LibraryItemAccess,
  LibraryVersionFile,
  UpsertLibraryFileData,
} from '@awaitstep/db'
import {
  checkLibraryItem,
  codeImports,
  draftFolders,
  type LibraryCheck,
  type LibrarySourceFile,
} from '../lib/library-check.js'
import { usagePlace } from '../lib/library-records.js'
import type { AppEnv } from '../types.js'

export const libraryVersions = new Hono<AppEnv>()

/** `source` with its top-level `version` set, keeping two-space JSON. Null when it is not a JSON object. */
function withVersion(source: string, version: string): string | null {
  try {
    const parsed: unknown = JSON.parse(source)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return `${JSON.stringify({ ...(parsed as Record<string, unknown>), version }, null, 2)}\n`
  } catch {
    return null
  }
}

function versionFile(file: LibrarySourceFile): LibraryVersionFile {
  return {
    path: file.path,
    source: file.source,
    hash: contentHash(file.source),
    size: projectFileBytes(file.source),
  }
}

function fileRow(itemId: string, path: string, source: string): UpsertLibraryFileData {
  return {
    id: nanoid(),
    itemId,
    path,
    source,
    hash: contentHash(source),
    size: projectFileBytes(source),
  }
}

/** The working copy and the check against it: what `check` answers and `publish` acts on. */
async function runCheck(
  db: DatabaseAdapter,
  found: LibraryItemAccess,
): Promise<{ files: LibraryFile[]; check: LibraryCheck }> {
  const files = await db.listLibraryFiles(found.item.id)
  const slugs = codeImports(files, found.item)
  const resolved = await db.resolveLibraryModules(
    {
      projectId: found.item.projectId,
      workspaceId: found.item.workspaceId,
      consumerItemId: found.item.id,
    },
    slugs,
  )
  return { files, check: checkLibraryItem(found.item, files, found.latestVersion, resolved) }
}

/** What a publish would do now: the version it would create and every problem in the way. */
libraryVersions.post('/items/:id/check', async (c) => {
  const found = c.get('libraryItem')!
  const { check } = await runCheck(c.get('db'), found)
  return c.json({
    version: check.version.ok ? check.version.version : null,
    bumpedFrom: check.version.ok ? (check.version.bumpedFrom ?? null) : null,
    problems: check.problems,
  })
})

/**
 * Publish: snapshot the working copy as a new immutable version. A module
 * publishes its package.json version (the next patch when it repeats the
 * latest, written back); a node its one unpublished version folder, which
 * leaves the working copy and becomes read-only. Every consumer's next
 * deploy takes it; at most three versions are kept.
 */
libraryVersions.post('/items/:id/versions', async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const { item } = found
  // The version rule is judged against the latest the item lookup read, and
  // the publish lands only while that is still the latest (`expectedSeq`).
  const [{ files, check }, kept] = await Promise.all([
    runCheck(db, found),
    db.listLibraryVersionImports(item.id),
  ])
  if (!check.version.ok && check.version.code === 'lower') {
    return c.json({ error: check.version.message }, 400)
  }
  if (!check.version.ok || check.problems.length > 0) {
    return c.json({ error: 'Fix these problems before publishing', details: check.problems }, 422)
  }
  const { version, bumpedFrom } = check.version

  let snapshot = check.snapshot
  let rewrite: { file: UpsertLibraryFileData; expectedHash: string } | null = null
  if (item.kind === 'module' && bumpedFrom) {
    const manifest = files.find((f) => f.path === PACKAGE_MANIFEST_PATH)!
    const bumped = withVersion(manifest.source, version)!
    rewrite = { file: fileRow(item.id, PACKAGE_MANIFEST_PATH, bumped), expectedHash: manifest.hash }
    snapshot = snapshot.map((f) =>
      f.path === PACKAGE_MANIFEST_PATH ? { path: f.path, source: bumped } : f,
    )
  }
  const removePaths =
    item.kind === 'node'
      ? files.filter((f) => f.path.startsWith(`${version}/`)).map((f) => f.path)
      : []
  // What the item uses afterwards: the working copy that stays, this version
  // and the versions kept beside it.
  const remaining = files.filter((f) => !removePaths.includes(f.path))
  const usageSlugs = new Set([
    ...codeImports(remaining, item),
    ...check.imports,
    ...kept.slice(0, MAX_LIBRARY_VERSIONS - 1).flatMap((v) => v.imports),
  ])
  const outcome = await db.publishLibraryVersion(
    {
      id: nanoid(),
      item: usagePlace(item),
      version,
      expectedSeq: found.latestSeq,
      files: snapshot.map(versionFile),
      imports: check.imports,
      publishedBy: c.get('userId'),
      removePaths,
      rewrite,
      usageSlugs: [...usageSlugs].sort(),
    },
    MAX_LIBRARY_VERSIONS,
  )
  if (!outcome.ok) {
    return c.json(
      {
        error:
          outcome.reason === 'changed'
            ? 'package.json changed while publishing. Try again'
            : `Version ${version} was published by someone else just now`,
      },
      409,
    )
  }
  return c.json(
    {
      version: outcome.version.version,
      seq: outcome.version.seq,
      publishedAt: outcome.version.publishedAt,
      bumpedFrom: bumpedFrom ?? null,
      pruned: outcome.pruned,
    },
    201,
  )
})

/** The kept versions, newest first (at most three). */
libraryVersions.get('/items/:id/versions', async (c) => {
  const found = c.get('libraryItem')!
  return c.json({ versions: await c.get('db').listLibraryVersions(found.item.id) })
})

libraryVersions.get('/items/:id/versions/:version', async (c) => {
  const found = c.get('libraryItem')!
  const version = c.req.param('version')
  if (!isLibraryVersion(version)) return c.json({ error: 'Version not found' }, 404)
  const detail = await c.get('db').getLibraryVersion(found.item.id, version)
  if (!detail) return c.json({ error: 'Version not found' }, 404)
  return c.json(detail)
})

/**
 * Copies a version's code into the working copy as the next patch after
 * the latest: for a module its whole working copy, for a node a new
 * unpublished folder (any open one is replaced). "New version" is a
 * restore of the latest.
 */
libraryVersions.post('/items/:id/versions/:version/restore', async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const { item } = found
  const from = c.req.param('version')
  if (!isLibraryVersion(from)) return c.json({ error: 'Version not found' }, 404)
  const [detail, current, kept] = await Promise.all([
    db.getLibraryVersion(item.id, from),
    db.listLibraryFileSummaries(item.id),
    db.listLibraryVersionImports(item.id),
  ])
  if (!detail || !found.latestVersion) return c.json({ error: 'Version not found' }, 404)
  const next = nextPatchVersion(found.latestVersion)

  let files: UpsertLibraryFileData[]
  let removePaths: string[]
  if (item.kind === 'module') {
    removePaths = current.map((f) => f.path)
    files = detail.files.map((f) =>
      fileRow(
        item.id,
        f.path,
        f.path === PACKAGE_MANIFEST_PATH ? (withVersion(f.source, next) ?? f.source) : f.source,
      ),
    )
  } else {
    const open = new Set(draftFolders(current.map((f) => f.path)))
    removePaths = current.filter((f) => open.has(f.path.split('/')[0]!)).map((f) => f.path)
    const hasIcon = current.some((f) => f.path === LIBRARY_NODE_ICON_PATH)
    files = detail.files.flatMap((f) => {
      if (f.path === LIBRARY_NODE_ICON_PATH) {
        return hasIcon ? [] : [fileRow(item.id, f.path, f.source)]
      }
      const source =
        f.path === LIBRARY_NODE_MANIFEST ? (withVersion(f.source, next) ?? f.source) : f.source
      return [fileRow(item.id, `${next}/${f.path}`, source)]
    })
  }
  // The restored files are the whole working copy's code: a module's is
  // replaced, and a node keeps nothing but its icon beside the new folder.
  const usageSlugs = new Set([...codeImports(files, item), ...kept.flatMap((v) => v.imports)])
  await db.restoreLibraryVersion({
    item: usagePlace(item),
    removePaths,
    files,
    usageSlugs: [...usageSlugs].sort(),
  })
  return c.json({ restoredFrom: from, version: next })
})
