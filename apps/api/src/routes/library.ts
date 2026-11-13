import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import {
  LIBRARY_ITEM_KINDS,
  MAX_LIBRARY_IMPORTS,
  MAX_LIBRARY_ITEMS_PER_OWNER,
  SLUG_PATTERN,
  inheritedWorkspaceRole,
  libraryDuplicateFiles,
  type Allowed,
  libraryFilePathError,
  libraryItemScaffold,
  projectFileBytes,
  slugify,
  libraryCreateCapability,
} from '@awaitstep/ir'
import {
  isUniqueViolation,
  type LibraryItemAccess,
  type LibraryConsumers,
  type LibraryOwner,
} from '@awaitstep/db'
import { codeImports, sizeProblems } from '../lib/library-check.js'
import { libraryItemRecord } from '../lib/library-records.js'
import { zValidator } from '../lib/validation.js'
import { apiKeyLevel } from '../middleware/auth.js'
import type { Context } from 'hono'
import type { AppEnv } from '../types.js'

const MAX_LIBRARY_SLUG = 64

const slugSchema = z
  .string()
  .min(1)
  .max(MAX_LIBRARY_SLUG)
  .regex(SLUG_PATTERN, 'Use lowercase letters, digits and inner hyphens')

const createSchema = z.object({
  kind: z.enum(LIBRARY_ITEM_KINDS),
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  description: z.string().max(500).optional(),
})

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    slug: slugSchema.optional(),
  })
  // Strict: a field the API no longer has (an old `shared`, say) is refused, not ignored.
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Send at least one of name, description or slug',
  })

const duplicateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: slugSchema.optional(),
    /** Where the copy goes: beside the item (the default), or the project's library. */
    to: z.literal('project').optional(),
  })
  .strict()

const moveSchema = z.object({ to: z.literal('project') }).strict()

const KIND_WORD = { module: 'module', node: 'custom node' } as const

/** "Used by Lead enrichment, Post to Slack and 1 more you can't open". */
export function consumerSentence(consumers: LibraryConsumers): string {
  const names = consumers.visible.map((c) => c.name)
  if (consumers.hiddenCount > 0) {
    names.push(
      consumers.hiddenCount === 1
        ? '1 more you can’t open'
        : `${consumers.hiddenCount} more you can’t open`,
    )
  }
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The slug a name gives: cut to length, then trimmed again, since the cut can land on a hyphen. */
function slugFromName(name: string): string {
  return slugify(name).slice(0, MAX_LIBRARY_SLUG).replace(/-+$/, '')
}

function fullLine() {
  return `This library is full: at most ${MAX_LIBRARY_ITEMS_PER_OWNER} items in one place`
}

/**
 * Whether the caller may add to the project's library from a workspace: an
 * Editor of the item's workspace (checked by `requireLibraryWrite`) must also
 * be a member of the project, and a workspace key reaches no further than its workspace.
 */
function projectWriteCapability(c: Context<AppEnv>): Allowed {
  if (apiKeyLevel(c) === 'workspace') {
    return { allowed: false, reason: 'A workspace key can’t add to the project’s library' }
  }
  return libraryCreateCapability(inheritedWorkspaceRole(c.get('projectRole')))
}

function projectWriteRefusal(c: Context<AppEnv>): Response | null {
  const can = projectWriteCapability(c)
  return can.allowed ? null : c.json({ error: can.reason ?? 'Forbidden' }, 403)
}

function projectOwner(found: LibraryItemAccess): LibraryOwner {
  return { kind: 'project', id: found.item.projectId, name: found.projectName }
}

/** "dates", "dates and fmt", "dates, fmt and log". */
function slugList(slugs: string[]): string {
  const quoted = slugs.map((slug) => `"${slug}"`)
  if (quoted.length <= 1) return quoted[0] ?? ''
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
}

export const library = new Hono<AppEnv>()

/**
 * The Library page in one request (28a/28b): the place's own items, the
 * project's own items a workspace may use, and — for the project — the
 * organization's marketplace nodes, with counts per kind.
 */
library.get('/summary', async (c) => {
  const db = c.get('db')
  const workspaceId = c.get('workspaceId')
  const scope = workspaceId
    ? {
        level: 'workspace' as const,
        projectId: c.get('projectId'),
        workspaceId,
        organizationId: c.get('organizationId'),
      }
    : {
        level: 'project' as const,
        projectId: c.get('projectId'),
        organizationId: c.get('organizationId'),
      }
  const summary = await db.getLibrarySummary(scope)
  const role = workspaceId ? c.get('workspaceRole') : inheritedWorkspaceRole(c.get('projectRole'))
  // A workspace's items can go to the project only for someone who may add there too.
  const toProject: Allowed = workspaceId
    ? projectWriteCapability(c)
    : { allowed: false, reason: 'These are the project’s own' }
  return c.json({ ...summary, viewerCan: { create: libraryCreateCapability(role), toProject } })
})

/** A new module or custom node, scaffolded, in the workspace the request names or the project. */
library.post('/items', zValidator('json', createSchema), async (c) => {
  const db = c.get('db')
  const body = c.req.valid('json')
  const slug = body.slug ?? slugFromName(body.name)
  if (!SLUG_PATTERN.test(slug)) {
    return c.json({ error: 'Name it with at least one letter or digit, or give a slug' }, 422)
  }
  const workspaceId = c.get('workspaceId') ?? null
  const id = nanoid()
  const files = libraryItemScaffold(body.kind, {
    slug,
    name: body.name,
    description: body.description,
  }).map((file) => ({
    id: nanoid(),
    itemId: id,
    path: file.path,
    source: file.source,
    hash: contentHash(file.source),
    size: projectFileBytes(file.source),
  }))
  let item
  try {
    item = await db.createLibraryItem(
      {
        id,
        projectId: c.get('projectId'),
        workspaceId,
        kind: body.kind,
        slug,
        name: body.name,
        description: body.description ?? '',
        createdBy: c.get('userId'),
        files,
      },
      MAX_LIBRARY_ITEMS_PER_OWNER,
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        { error: `A ${KIND_WORD[body.kind]} with the slug "${slug}" already exists here` },
        409,
      )
    }
    throw error
  }
  if (!item) {
    return c.json({ error: fullLine() }, 422)
  }
  const owner: LibraryOwner = workspaceId
    ? { kind: 'workspace', id: workspaceId, name: c.get('workspaceName') ?? '' }
    : { kind: 'project', id: c.get('projectId'), name: c.get('projectName') ?? '' }
  const role = workspaceId ? c.get('workspaceRole') : inheritedWorkspaceRole(c.get('projectRole'))
  return c.json(libraryItemRecord(item, owner, null, role), 201)
})

library.get('/items/:id', async (c) => {
  const found = c.get('libraryItem')!
  return c.json(
    libraryItemRecord(found.item, found.owner, found.latestVersion, c.get('libraryRole')),
  )
})

/** Rename, describe or change the slug; a module's slug change is refused while anything uses it. */
library.patch('/items/:id', zValidator('json', updateSchema), async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const changes = c.req.valid('json')
  const outcome = await db.updateLibraryItem(c.get('userId'), found.item.id, changes)
  if (outcome.ok) {
    return c.json(
      libraryItemRecord(outcome.item, found.owner, found.latestVersion, c.get('libraryRole')),
    )
  }
  if (outcome.reason === 'missing') return c.json({ error: 'Not found' }, 404)
  const word = KIND_WORD[found.item.kind]
  if (outcome.reason === 'slug-taken') {
    const slug = changes.slug ?? found.item.slug
    return c.json({ error: `A ${word} with the slug "${slug}" already exists here` }, 409)
  }
  return c.json(
    {
      error: `Can’t change the slug while it’s used by ${consumerSentence(outcome.consumers)}`,
      consumers: outcome.consumers,
    },
    409,
  )
})

/**
 * A copy of the item beside it, under a new name and slug, starting again at
 * 1.0.0 and unpublished: a module's working copy, or a node's newest code
 * (its open draft, else its latest version) with the icon. One read, then
 * one insert that also holds the owner's cap.
 */
library.post('/items/:id/duplicate', zValidator('json', duplicateSchema), async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  const body = c.req.valid('json')
  const toProject = body.to === 'project' && found.item.workspaceId !== null
  if (toProject) {
    const refusal = projectWriteRefusal(c)
    if (refusal) return refusal
  }
  const workspaceId = toProject ? null : found.item.workspaceId
  const where = toProject ? 'in the project’s library' : 'here'
  const slug = body.slug ?? slugFromName(body.name)
  if (!SLUG_PATTERN.test(slug)) {
    return c.json({ error: 'Name it with at least one letter or digit, or give a slug' }, 422)
  }
  const sources = await db.getLibraryItemSources(found.item.id)
  const id = nanoid()
  const files = libraryDuplicateFiles(found.item.kind, sources, { slug, name: body.name }).map(
    (file) => ({
      id: nanoid(),
      itemId: id,
      path: file.path,
      source: file.source,
      hash: contentHash(file.source),
      size: projectFileBytes(file.source),
    }),
  )
  // The copy is held to the rules any write is: its paths (a draft from
  // before a name was reserved), the size caps, and how many modules it imports.
  const usageSlugs = codeImports(files, { kind: found.item.kind, slug })
  const problems = [
    ...files.flatMap((file) => {
      const error = libraryFilePathError(found.item.kind, file.path)
      return error ? [{ path: file.path, message: `"${file.path}" ${error}` }] : []
    }),
    ...sizeProblems(files),
    ...(usageSlugs.length > MAX_LIBRARY_IMPORTS
      ? [
          {
            path: '',
            message: `Imports ${usageSlugs.length} modules; at most ${MAX_LIBRARY_IMPORTS}`,
          },
        ]
      : []),
  ]
  if (problems.length > 0) {
    return c.json({ error: 'Fix these problems before duplicating it', details: problems }, 422)
  }
  let item
  try {
    item = await db.createLibraryItem(
      {
        id,
        projectId: found.item.projectId,
        workspaceId,
        kind: found.item.kind,
        slug,
        name: body.name,
        description: found.item.description,
        createdBy: c.get('userId'),
        files,
        // Copied code keeps its imports: the modules it uses are guarded as for the original.
        usageSlugs,
      },
      MAX_LIBRARY_ITEMS_PER_OWNER,
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json(
        {
          error: `A ${KIND_WORD[found.item.kind]} with the slug "${slug}" already exists ${where}`,
        },
        409,
      )
    }
    throw error
  }
  if (!item) return c.json({ error: fullLine() }, 422)
  if (!toProject) {
    return c.json(libraryItemRecord(item, found.owner, null, c.get('libraryRole')), 201)
  }
  const role = inheritedWorkspaceRole(c.get('projectRole'))
  return c.json(libraryItemRecord(item, projectOwner(found), null, role), 201)
})

/**
 * Hands a workspace's item to the project's library: the same item, with its
 * id, versions and history, so the workflows placing it and the code
 * importing it keep working, and every workspace in the project can use it.
 * Refused when the project has the slug, is full, or lacks a module it imports.
 */
library.post('/items/:id/move', zValidator('json', moveSchema), async (c) => {
  const found = c.get('libraryItem')!
  const workspaceId = found.item.workspaceId
  if (workspaceId === null) {
    return c.json({ error: 'It’s already in the project’s library' }, 409)
  }
  const refusal = projectWriteRefusal(c)
  if (refusal) return refusal
  const outcome = await c
    .get('db')
    .moveLibraryItemToProject(found.item.id, workspaceId, MAX_LIBRARY_ITEMS_PER_OWNER)
  if (outcome.ok) {
    const role = inheritedWorkspaceRole(c.get('projectRole'))
    return c.json(libraryItemRecord(outcome.item, projectOwner(found), found.latestVersion, role))
  }
  const word = KIND_WORD[found.item.kind]
  switch (outcome.reason) {
    case 'slug-taken':
      return c.json(
        { error: `The project’s library already has a ${word} with the slug "${found.item.slug}"` },
        409,
      )
    case 'full':
      return c.json({ error: fullLine() }, 422)
    case 'unresolved': {
      const them = outcome.slugs.length === 1 ? 'it' : 'them'
      return c.json(
        {
          error: `It imports ${slugList(outcome.slugs)} from this workspace only: move ${them} to the project first`,
          slugs: outcome.slugs,
        },
        409,
      )
    }
    case 'missing':
      return c.json({ error: 'Not found' }, 404)
  }
})

/** Refused while anything uses the item, naming who. */
library.delete('/items/:id', async (c) => {
  const db = c.get('db')
  const found = c.get('libraryItem')!
  if (await db.deleteLibraryItemIfUnused(found.item.id)) return c.body(null, 204)
  const consumers = await db.getLibraryConsumers(c.get('userId'), found.item.id)
  if (consumers.visible.length === 0 && consumers.hiddenCount === 0) {
    // What refused it went away in between: one more try, else it is gone.
    if (await db.deleteLibraryItemIfUnused(found.item.id)) return c.body(null, 204)
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ error: `Can’t delete: used by ${consumerSentence(consumers)}`, consumers }, 409)
})

/** What the item imports and who uses it, each consumer with the version it runs. */
library.get('/items/:id/usages', async (c) => {
  const found = c.get('libraryItem')!
  return c.json(await c.get('db').getLibraryUsages(c.get('userId'), found.item.id))
})
