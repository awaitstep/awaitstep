import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DrizzleDatabaseAdapter, schema } from '@awaitstep/db'
import { createApp, type AppDeps } from '../app.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import type { Auth } from '../auth/config.js'
import type {
  AccessRequestEmail,
  AppEmails,
  InvitationEmail,
  InviteRequestEmail,
  RunFailedEmail,
} from '../types.js'

// The app on a real, migrated SQLite database, for the routes whose answers
// are the adapter's SQL (people, roles, invitations, requests): the mock in
// helpers.ts knows one person and one org, and these are about who sees what.
// The session is chosen per request by an `x-test-user` header.

const MIGRATIONS = fileURLToPath(new URL('../../../../packages/db/drizzle/sqlite', import.meta.url))

export interface TestPerson {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

const sqliteSchema = schema.sqlite

export function createSqliteApp(
  options: Pick<AppDeps, 'enableLocalDev' | 'accountProviders' | 'imageStore'> = {},
) {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: sqliteSchema })
  migrate(db, { migrationsFolder: MIGRATIONS })
  const adapter = new DrizzleDatabaseAdapter(db, sqliteSchema, { dialect: 'sqlite' })

  const people = new Map<string, TestPerson>()
  const auth = {
    handler: async () => new Response(JSON.stringify({ ok: true })),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-user')
        const person = id ? people.get(id) : undefined
        if (!person) return null
        return {
          user: {
            id: person.id,
            email: person.email,
            name: person.name,
            emailVerified: person.emailVerified,
          },
          session: {
            id: `session-${person.id}`,
            userId: person.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
        }
      },
    },
  } as unknown as Auth

  const sent = {
    invitations: [] as InvitationEmail[],
    requests: [] as InviteRequestEmail[],
    accessRequests: [] as AccessRequestEmail[],
    runFailures: [] as RunFailedEmail[],
  }
  const emails: AppEmails = {
    inviteUrl: (id) => `http://web.test/invite/${id}`,
    membersUrl: (slug) => `http://web.test/${slug}/settings/members`,
    inboxUrl: (slug) => `http://web.test/${slug}/inbox`,
    runsUrl: (s) => `http://web.test/${s.org}/${s.project}/${s.workspace}/runs`,
    async sendInvitation(data) {
      sent.invitations.push(data)
    },
    async sendInviteRequest(data) {
      sent.requests.push(data)
    },
    async sendAccessRequest(data) {
      sent.accessRequests.push(data)
    },
    async sendRunFailed(data) {
      sent.runFailures.push(data)
    },
  }

  const app = createApp({ db: adapter, auth, corsOrigin: '*', isDev: true, emails, ...options })

  const T0 = '2026-10-20T00:00:00.000Z'
  const seed = {
    async person(id: string, name: string, email: string, { emailVerified = true } = {}) {
      people.set(id, { id, name, email, emailVerified })
      await db
        .insert(sqliteSchema.user)
        .values({ id, name, email, emailVerified, createdAt: T0, updatedAt: T0 })
    },
    async org(id: string, name: string, slug: string) {
      await db.insert(sqliteSchema.organization).values({ id, name, slug, createdAt: T0 })
    },
    async member(userId: string, organizationId: string, role: string) {
      await db.insert(sqliteSchema.member).values({
        id: `m-${organizationId}-${userId}`,
        userId,
        organizationId,
        role,
        createdAt: T0,
      })
    },
    async project(id: string, organizationId: string, name: string, slug: string) {
      await db
        .insert(sqliteSchema.projects)
        .values({ id, organizationId, name, slug, createdAt: T0, updatedAt: T0 })
    },
    async workspace(id: string, projectId: string, name: string, slug: string, createdAt = T0) {
      await db.insert(sqliteSchema.workspaces).values({
        id,
        projectId,
        name,
        slug,
        colour: 'green',
        createdBy: null,
        createdAt,
        updatedAt: T0,
      })
    },
    async projectGrant(projectId: string, userId: string, role: 'admin' | 'member') {
      await db
        .insert(sqliteSchema.projectMembers)
        .values({ projectId, userId, role, createdBy: null, createdAt: T0 })
    },
    async workspaceGrant(workspaceId: string, userId: string, role: 'admin' | 'editor' | 'viewer') {
      await db
        .insert(sqliteSchema.workspaceMembers)
        .values({ workspaceId, userId, role, createdBy: null, createdAt: T0 })
    },
    /**
     * A key minted at a level, with the grid it carries (`permissions`) and
     * the secret it answers to (`ask_<id>`). Returns the request init to call as it.
     */
    async key(
      id: string,
      createdBy: string,
      at:
        | { level: 'organization' }
        | { level: 'project'; projectId: string }
        | { level: 'workspace'; projectId: string; workspaceId: string },
      permissions: Record<string, string[]>,
    ) {
      const raw = `ask_${id}`
      await db.insert(sqliteSchema.apiKeys).values({
        id,
        organizationId: at.level === 'organization' ? 'org-acme' : null,
        projectId: at.level === 'organization' ? null : at.projectId,
        workspaceId: at.level === 'workspace' ? at.workspaceId : null,
        parentKeyId: null,
        createdBy,
        name: id,
        keyHash: await hashApiKey(raw),
        keyPrefix: raw.slice(0, 8),
        keySuffix: raw.slice(-4),
        scopes: '["read"]',
        permissions: JSON.stringify(permissions),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: T0,
      })
      return { headers: { Authorization: `Bearer ${raw}`, 'Content-Type': 'application/json' } }
    },
    async workflow(id: string, projectId: string, workspaceId: string, name: string) {
      await db.insert(sqliteSchema.workflows).values({
        id,
        projectId,
        workspaceId,
        createdBy: 'seed',
        name,
        createdAt: T0,
        updatedAt: T0,
      })
    },
  }

  /** A request as `userId`: `app.request(path, as('u-ama', { method: 'POST', body }))`. */
  function as(userId: string, init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers)
    headers.set('x-test-user', userId)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    return { ...init, headers }
  }

  const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) })

  return { app, adapter, db, schema: sqliteSchema, sqlite, seed, as, json, sent, emails, people }
}

export type SqliteApp = ReturnType<typeof createSqliteApp>

/**
 * Acme: Ama owns it, Ben is its admin, Dan is a project member of Project
 * 101, Eve holds a Viewer grant in Sales only, Fay is a plain member with no
 * rows, Gus holds an Editor grant in Ops only. Globex: Cleo owns it, Ama is
 * a plain member there. Project 101 has Sales and Ops (a workflow in each);
 * Project 202 and Globex's app have Default.
 */
export async function seedAcme(h: SqliteApp) {
  const { seed } = h
  await seed.person('u-ama', 'Ama Mensah', 'ama@acme.test')
  await seed.person('u-ben', 'Ben Okoro', 'ben@acme.test')
  await seed.person('u-dan', 'Dan Kim', 'dan@acme.test')
  await seed.person('u-eve', 'Eve Park', 'eve@acme.test')
  await seed.person('u-fay', 'Fay Lund', 'fay@acme.test')
  await seed.person('u-gus', 'Gus Roy', 'gus@acme.test')
  await seed.person('u-cleo', 'Cleo Park', 'cleo@globex.test')
  await seed.person('u-hal', 'Hal Ito', 'hal@example.test')
  await seed.org('org-acme', 'Acme', 'acme')
  await seed.org('org-globex', 'Globex', 'globex')
  await seed.member('u-ama', 'org-acme', 'owner')
  await seed.member('u-ben', 'org-acme', 'admin')
  await seed.member('u-dan', 'org-acme', 'member')
  await seed.member('u-eve', 'org-acme', 'member')
  await seed.member('u-fay', 'org-acme', 'member')
  await seed.member('u-gus', 'org-acme', 'member')
  await seed.member('u-cleo', 'org-globex', 'owner')
  await seed.member('u-ama', 'org-globex', 'member')
  await seed.project('p-101', 'org-acme', 'Project 101', 'project-101')
  await seed.project('p-202', 'org-acme', 'Project 202', 'project-202')
  await seed.project('p-g', 'org-globex', 'Globex app', 'app')
  await seed.workspace('ws-sales', 'p-101', 'Sales', 'sales', '2026-10-20T00:00:00.000Z')
  await seed.workspace('ws-ops', 'p-101', 'Ops', 'ops', '2026-10-21T00:00:00.000Z')
  await seed.workspace('ws-202', 'p-202', 'Default', 'default')
  await seed.workspace('ws-g', 'p-g', 'Default', 'default')
  await seed.projectGrant('p-101', 'u-dan', 'member')
  await seed.workspaceGrant('ws-sales', 'u-eve', 'viewer')
  await seed.workspaceGrant('ws-ops', 'u-gus', 'editor')
  await seed.workflow('wf-sales', 'p-101', 'ws-sales', 'In sales')
  await seed.workflow('wf-ops', 'p-101', 'ws-ops', 'In ops')
}
