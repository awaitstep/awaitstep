import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import {
  LIBRARY_MODULE_IMPORT_PREFIX,
  LIBRARY_NODE_ICON_PATH,
  MAX_LIBRARY_ICON_BYTES,
  MAX_LIBRARY_VERSIONS,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  PROJECT_FILE_EXTENSIONS,
  findProjectPathCollision,
  isProjectCodePath,
  libraryFilePathError,
  libraryIconError,
  libraryImportSlugs,
  nodeVersionFolder,
  packageManifestWriteErrors,
  projectFileBytes,
  validatePackageManifest,
} from '@awaitstep/ir'
import { draftFolders } from '../lib/library-check.js'
import { libraryFileRecord, refreshLibraryUsages } from '../lib/library-records.js'
import { etag, requestedHash } from '../lib/project-files.js'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

const putFileSchema = z.object({ source: z.string().max(MAX_PROJECT_FILE_BYTES) })

const CONVENTIONS = {
  importPrefix: LIBRARY_MODULE_IMPORT_PREFIX,
  extensions: PROJECT_FILE_EXTENSIONS,
  limits: {
    maxFiles: MAX_PROJECT_FILES,
    maxFileBytes: MAX_PROJECT_FILE_BYTES,
    maxTotalBytes: MAX_PROJECT_TOTAL_BYTES,
    maxIconBytes: MAX_LIBRARY_ICON_BYTES,
    maxVersions: MAX_LIBRARY_VERSIONS,
  },
}

function readOnlyFolder(folder: string): string {
  return `Version ${folder} is published and can’t change. Start a new version from it`
}

export const libraryFiles = new Hono<AppEnv>()

/**
 * The item's tree: the working copy, and — for a custom node — each
 * published version folder, read-only. A module's published versions are
 * its history, read through `/versions`.
 */
libraryFiles.get('/items/:id/project', async (c) => {
  const found = c.get('libraryItem')!
  // A module's versions are its history (empty here); a node's arrive without their icon.
  const tree = await c.get('db').getLibraryTree(found.item.id, found.item.kind)
  const published = tree.published.map((file) => ({
    path: `${file.version}/${file.path}`,
    hash: file.hash,
    size: file.size,
    updatedAt: file.publishedAt,
    readOnly: true,
  }))
  return c.json({
    ...CONVENTIONS,
    kind: found.item.kind,
    files: [
      ...tree.files.map((file) => ({ ...libraryFileRecord(file), readOnly: false })),
      ...published,
    ],
  })
})

libraryFiles.get('/items/:id/files/:path{.+}', async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const path = c.req.param('path')
  // A node's published folder is read out of its version row, one file in SQL.
  const folder = found.item.kind === 'node' ? nodeVersionFolder(path) : null
  const inFolder = folder ? path.slice(folder.length + 1) : null
  const [file, published] = await Promise.all([
    db.getLibraryFile(found.item.id, path),
    folder && inFolder !== LIBRARY_NODE_ICON_PATH
      ? db.getLibraryVersionFile(found.item.id, folder, inFolder!)
      : Promise.resolve(null),
  ])
  if (file) {
    c.header('ETag', etag(file.hash))
    return c.json({ ...libraryFileRecord(file), source: file.source, readOnly: false })
  }
  if (!published) return c.json({ error: 'File not found' }, 404)
  return c.json({
    path,
    hash: published.hash,
    size: published.size,
    updatedAt: published.publishedAt,
    source: published.source,
    readOnly: true,
  })
})

/**
 * Create or replace one working-copy file, with the `If-Match` /
 * `If-None-Match` contract of a workflow's project files. A node's
 * published version folder is read-only, and its working copy holds one
 * unpublished folder at a time.
 */
libraryFiles.put('/items/:id/files/:path{.+}', zValidator('json', putFileSchema), async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const { item } = found
  const path = c.req.param('path')
  const pathError = libraryFilePathError(item.kind, path)
  if (pathError) return c.json({ error: `Invalid file path "${path}": ${pathError}` }, 422)
  const { source } = c.req.valid('json')
  const expected = requestedHash(c.req.header('If-Match'))
  const mustCreate = c.req.header('If-None-Match') !== undefined
  if (mustCreate && expected !== null) {
    return c.json({ error: 'Send either If-Match or If-None-Match, not both' }, 400)
  }
  const size = projectFileBytes(source)
  if (size > MAX_PROJECT_FILE_BYTES) {
    return c.json({ error: `File exceeds ${MAX_PROJECT_FILE_BYTES} bytes` }, 422)
  }
  if (item.kind === 'node' && path === LIBRARY_NODE_ICON_PATH) {
    const iconError = libraryIconError(source)
    if (iconError) return c.json({ error: iconError }, 422)
  }
  if (item.kind === 'module' && path === PACKAGE_MANIFEST_PATH) {
    const errors = [...validatePackageManifest(source), ...packageManifestWriteErrors(source)]
    if (errors.length > 0) return c.json({ error: 'Invalid package.json', details: errors }, 422)
  }

  const code = isProjectCodePath(path)
  const folder = item.kind === 'node' ? nodeVersionFolder(path) : null
  const [existing, published, previous] = await Promise.all([
    db.listLibraryFileSummaries(item.id),
    folder ? db.libraryVersionExists(item.id, folder) : Promise.resolve(false),
    code ? db.getLibraryFile(item.id, path) : Promise.resolve(null),
  ])
  if (folder && published) {
    return c.json({ error: readOnlyFolder(folder) }, 409)
  }
  if (folder) {
    const others = draftFolders(existing.map((f) => f.path)).filter((f) => f !== folder)
    if (others.length > 0) {
      return c.json(
        { error: `Only one unpublished version at a time: ${others.join(', ')} is open` },
        422,
      )
    }
  }
  const current = existing.find((f) => f.path === path) ?? null
  const collision = findProjectPathCollision(
    path,
    existing.map((f) => f.path),
  )
  if (collision) return c.json({ error: `"${path}" would overwrite "${collision}"` }, 422)
  if (!current && existing.length >= MAX_PROJECT_FILES) {
    return c.json({ error: `Maximum ${MAX_PROJECT_FILES} files` }, 422)
  }
  const total = existing.reduce((sum, f) => sum + (f.path === path ? 0 : f.size), 0) + size
  if (total > MAX_PROJECT_TOTAL_BYTES) {
    return c.json({ error: `Files would exceed ${MAX_PROJECT_TOTAL_BYTES} bytes` }, 422)
  }

  const row = { id: nanoid(), itemId: item.id, path, source, hash: contentHash(source), size }
  const saved = mustCreate
    ? await db.createLibraryFile(row)
    : expected === null
      ? await db.upsertLibraryFile(row)
      : await db.updateLibraryFileIfMatches(row, expected)
  if (!saved) {
    const latest = await db.getLibraryFile(item.id, path)
    const error = mustCreate
      ? 'File already exists'
      : latest
        ? 'File changed since it was read'
        : 'File does not exist'
    return c.json({ error, currentHash: latest?.hash ?? null }, 409)
  }
  // Only a write that changed what the file imports changes the usage rows.
  if (
    code &&
    libraryImportSlugs([source]).join() !== libraryImportSlugs([previous?.source ?? '']).join()
  ) {
    await refreshLibraryUsages(db, item)
  }
  c.header('ETag', etag(saved.hash))
  return c.json(libraryFileRecord(saved), current ? 200 : 201)
})

libraryFiles.delete('/items/:id/files/:path{.+}', async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const path = c.req.param('path')
  const expected = requestedHash(c.req.header('If-Match'))
  const removed = await db.deleteLibraryFile(
    found.item.id,
    path,
    expected !== null && expected !== '*' ? expected : undefined,
  )
  if (removed) {
    if (isProjectCodePath(path)) await refreshLibraryUsages(db, found.item)
    return c.body(null, 204)
  }
  const folder = found.item.kind === 'node' ? nodeVersionFolder(path) : null
  const [current, published] = await Promise.all([
    db.getLibraryFile(found.item.id, path),
    folder ? db.libraryVersionExists(found.item.id, folder) : Promise.resolve(false),
  ])
  if (current) {
    return c.json({ error: 'File changed since it was read', currentHash: current.hash }, 409)
  }
  if (folder && published) return c.json({ error: readOnlyFolder(folder) }, 409)
  return c.json({ error: 'File not found' }, 404)
})
