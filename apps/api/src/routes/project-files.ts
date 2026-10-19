import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import {
  GENERATED_PATH_RULES,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_PATH,
  PROJECT_FILE_EXTENSIONS,
  PROJECT_IMPORT_PREFIX,
  PROJECT_ROOT_CONFIG_FILES,
  findProjectPathCollision,
  projectFileBytes,
  projectFilePathError,
  validatePackageManifest,
} from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow, WorkflowFile, WorkflowSourceMode } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

// Character cap only guards the parser; the exact UTF-8 byte cap is applied
// below so the limit agents see in GET /project is the one enforced.
const putFileSchema = z.object({
  source: z.string().max(MAX_PROJECT_FILE_BYTES),
})

/** What an agent needs to know before writing: where it may write, how to import, how much. */
const CONVENTIONS = {
  importPrefix: PROJECT_IMPORT_PREFIX,
  generated: GENERATED_PATH_RULES,
  rootConfigFiles: PROJECT_ROOT_CONFIG_FILES,
  extensions: PROJECT_FILE_EXTENSIONS,
  limits: {
    maxFiles: MAX_PROJECT_FILES,
    maxFileBytes: MAX_PROJECT_FILE_BYTES,
    maxTotalBytes: MAX_PROJECT_TOTAL_BYTES,
  },
}

export const projectFiles = new Hono<AppEnv>()

function summarize(file: WorkflowFile) {
  return { path: file.path, hash: file.hash, size: file.size, updatedAt: file.updatedAt }
}

function etag(hash: string): string {
  return `"${hash}"`
}

/**
 * `If-Match` as a hash: quotes and the weak marker are stripped, `*` means
 * "any existing version". Null when the header is absent.
 */
function requestedHash(header: string | undefined): string | null {
  if (header === undefined) return null
  const trimmed = header.trim().replace(/^W\//, '')
  if (trimmed === '*') return '*'
  return trimmed.replace(/^"|"$/g, '')
}

/** The source mode writes would apply to: the current version's, or generated when there is none yet. */
async function currentSourceMode(
  db: DatabaseAdapter,
  workflow: Workflow,
): Promise<WorkflowSourceMode> {
  if (!workflow.currentVersionId) return 'generated'
  const version = await db.getWorkflowVersionById(workflow.currentVersionId)
  return (version?.sourceMode ?? 'generated') as WorkflowSourceMode
}

function ejectedResponse(sourceMode: WorkflowSourceMode) {
  return {
    error:
      'The current version owns its source (ejected); edit files through PUT /source or revert to visual mode first',
    sourceMode,
  }
}

/**
 * The project's file tree with content hashes plus the conventions: what an
 * agent polls to know whether anything changed and where it may write.
 */
projectFiles.get('/:workflowId/project', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const [files, sourceMode] = await Promise.all([
    db.listWorkflowFiles(workflow.id),
    currentSourceMode(db, workflow),
  ])
  return c.json({ ...CONVENTIONS, sourceMode, files: files.map(summarize) })
})

projectFiles.get('/:workflowId/files/:path{.+}', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const file = await db.getWorkflowFile(workflow.id, c.req.param('path'))
  if (!file) return c.json({ error: 'File not found' }, 404)
  c.header('ETag', etag(file.hash))
  return c.json({ ...summarize(file), source: file.source })
})

/**
 * Create or replace one project file. `If-Match` (a hash from a previous
 * read, or `*` for "must already exist") and `If-None-Match: *` ("must not
 * exist yet") make the write conditional so two writers — a person in the
 * IDE and an agent — cannot silently clobber each other; each precondition
 * is enforced inside the statement itself, and a failure is a 409 carrying
 * the current hash.
 */
projectFiles.put('/:workflowId/files/:path{.+}', zValidator('json', putFileSchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const path = c.req.param('path')
  const pathError = projectFilePathError(path)
  if (pathError) {
    return c.json({ error: `Invalid project file path "${path}": ${pathError}` }, 422)
  }
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
  if (path === PACKAGE_MANIFEST_PATH) {
    const manifestErrors = validatePackageManifest(source)
    if (manifestErrors.length > 0) {
      return c.json({ error: 'Invalid package.json', details: manifestErrors }, 422)
    }
  }

  // One listing answers the count and total-size caps and the collision
  // check; the current version's mode decides whether writes apply at all.
  const [existing, sourceMode] = await Promise.all([
    db.listWorkflowFiles(workflow.id),
    currentSourceMode(db, workflow),
  ])
  if (sourceMode !== 'generated') return c.json(ejectedResponse(sourceMode), 409)

  const current = existing.find((f) => f.path === path) ?? null
  const collision = findProjectPathCollision(
    path,
    existing.map((f) => f.path),
  )
  if (collision) {
    return c.json({ error: `"${path}" would overwrite "${collision}" after compile` }, 422)
  }
  if (!current && existing.length >= MAX_PROJECT_FILES) {
    return c.json({ error: `Maximum ${MAX_PROJECT_FILES} project files` }, 422)
  }
  const total = existing.reduce((sum, f) => sum + (f.path === path ? 0 : f.size), 0) + size
  if (total > MAX_PROJECT_TOTAL_BYTES) {
    return c.json({ error: `Project files would exceed ${MAX_PROJECT_TOTAL_BYTES} bytes` }, 422)
  }

  const row = {
    id: nanoid(),
    workflowId: workflow.id,
    path,
    source,
    hash: contentHash(source),
    size,
  }
  const saved = mustCreate
    ? await db.createWorkflowFile(row)
    : expected === null
      ? await db.upsertWorkflowFile(row)
      : await db.updateWorkflowFileIfMatches(row, expected)
  if (!saved) {
    const latest = await db.getWorkflowFile(workflow.id, path)
    const error = mustCreate
      ? 'File already exists'
      : latest
        ? 'File changed since it was read'
        : 'File does not exist'
    return c.json({ error, currentHash: latest?.hash ?? null }, 409)
  }
  c.header('ETag', etag(saved.hash))
  return c.json(summarize(saved), current ? 200 : 201)
})

/**
 * Removing a project file that stands in for a legacy workflow setting
 * (handlers.ts for trigger code, package.json for dependencies) must not
 * let the setting resurface: the workspace would show the "deleted" file
 * again as a virtual seed, and the next deploy would still use it.
 */
const LEGACY_SETTING_BY_PATH: Readonly<
  Record<string, { triggerCode?: null; dependencies?: null }>
> = {
  [PROJECT_HANDLERS_PATH]: { triggerCode: null },
  [PACKAGE_MANIFEST_PATH]: { dependencies: null },
}

projectFiles.delete('/:workflowId/files/:path{.+}', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const sourceMode = await currentSourceMode(db, workflow)
  if (sourceMode !== 'generated') return c.json(ejectedResponse(sourceMode), 409)

  const path = c.req.param('path')
  const expected = requestedHash(c.req.header('If-Match'))
  // The hash rides in the DELETE's own WHERE clause; only a miss needs a
  // second look to tell "gone" from "changed".
  const removed = await db.deleteWorkflowFile(
    workflow.id,
    path,
    expected !== null && expected !== '*' ? expected : undefined,
  )
  if (removed) {
    // A follow-up write, not a lookup: it only applies once the conditional
    // delete has succeeded.
    const legacy = LEGACY_SETTING_BY_PATH[path]
    if (legacy) await db.updateWorkflow(workflow.id, legacy)
    return c.body(null, 204)
  }

  const current = await db.getWorkflowFile(workflow.id, path)
  if (!current) return c.json({ error: 'File not found' }, 404)
  return c.json({ error: 'File changed since it was read', currentHash: current.hash }, 409)
})
