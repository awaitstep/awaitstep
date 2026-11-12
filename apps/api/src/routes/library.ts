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
  libraryFilePathError,
  libraryItemScaffold,
  projectFileBytes,
  slugify,
  libraryCreateCapability,
} from '@awaitstep/ir'
import { isUniqueViolation, type LibraryConsumers, type LibraryOwner } from '@awaitstep/db'
import { codeImports, sizeProblems } from '../lib/library-check.js'
import { libraryItemRecord } from '../lib/library-records.js'
import { zValidator } from '../lib/validation.js'
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
  })
  .strict()

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
  return c.json({ ...summary, viewerCan: { create: libraryCreateCapability(role) } })
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
        workspaceId: found.item.workspaceId,
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
        { error: `A ${KIND_WORD[found.item.kind]} with the slug "${slug}" already exists here` },
        409,
      )
    }
    throw error
  }
  if (!item) return c.json({ error: fullLine() }, 422)
  return c.json(libraryItemRecord(item, found.owner, null, c.get('libraryRole')), 201)
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
