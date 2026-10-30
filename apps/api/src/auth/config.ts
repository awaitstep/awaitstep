import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink, organization } from 'better-auth/plugins'
import { CLIENT_IP_HEADER } from '../lib/client-ip.js'
import { orgSlugProblem } from '../lib/slugs.js'
import { stripUnsafeText } from '@awaitstep/ir'

export interface AuthOptions {
  baseURL: string
  secret: string
  database: unknown
  trustedOrigins?: string[]
  github?: { clientId: string; clientSecret: string }
  google?: { clientId: string; clientSecret: string }
  sendMagicLink?: (data: { email: string; url: string; token: string }) => Promise<void>
  /**
   * better-auth's limiter on sign-in, sign-up and the password/email-change
   * paths. Decided by the entry point: left to better-auth it follows
   * NODE_ENV, which a Worker typically does not set.
   */
  rateLimit?: boolean
  /**
   * Why an organization may not be deleted right now (projects still in it),
   * or null. Read by the deletion hook; without it any owner may delete.
   */
  deleteOrganizationProblem?: (organizationId: string) => Promise<string | null>
  /** Called once a session is created — a sign-in — for the audit log (B7). */
  onSessionCreated?: (session: {
    id: string
    userId: string
    ipAddress?: string | null
  }) => Promise<void>
  /** Called once an owner or admin changed the organization's name or URL, for the audit log. */
  onOrganizationUpdated?: (data: {
    organization: { id: string; name: string; slug: string }
    user: { id: string; name: string; email: string }
  }) => Promise<void>
}

/** Longest name a person may choose. */
export const MAX_PERSON_NAME = 255

/** A person's name as stored: no controls or direction overrides, trimmed. */
function personName(name: string): string {
  return stripUnsafeText(name).trim()
}

function refuseBadOrgSlug(slug: unknown): void {
  const problem = orgSlugProblem(slug)
  if (problem) throw new APIError('BAD_REQUEST', { message: problem })
}

// Members and invitations are managed through this API's own routes
// (`/api/members`, `/api/invitations`), which write the project and
// workspace rows better-auth knows nothing about, in one unit with the
// member row. Its own endpoints for them are closed, so there is one path.
// `addMember` has no hook here: better-auth calls it for the creator of a
// new organization, and closing it closed organization creation.
const USE_THE_API = 'Members and invitations are managed through the AwaitStep API'

function closed(): never {
  throw new APIError('FORBIDDEN', { message: USE_THE_API })
}

// Leaving has no organization hook, so it is closed at the request: a
// member's rows below the organization must go with the member row, which
// `/organization/leave` would not do. Until B10 offers it, leaving is a
// removal by an owner or admin. The two reads that hand every member the
// organization's pending invitations — whose ids are the invite links — are
// closed the same way; this API lists invitations to owners and admins.
const CLOSED_PATHS = new Set([
  '/organization/leave',
  '/organization/get-full-organization',
  '/organization/list-invitations',
])

export function createAuth(options: AuthOptions) {
  return betterAuth({
    basePath: '/api/auth',
    baseURL: options.baseURL,
    secret: options.secret,
    database: options.database as Parameters<typeof betterAuth>[0]['database'],
    trustedOrigins: options.trustedOrigins ?? [options.baseURL],
    plugins: [
      ...(options.sendMagicLink
        ? [
            magicLink({
              sendMagicLink: options.sendMagicLink,
            }),
          ]
        : []),
      organization({
        allowUserToCreateOrganization: true,
        // An organization's slug is the first segment of every dashboard URL
        // and is globally unique (better-auth refuses a taken one). It keeps
        // to the same rule as projects and workspaces: the slug shape, and
        // never a page the app already serves at the top level (`/settings`,
        // `/sign-in`, …). The client sends the name slugified; a collision
        // comes back as better-auth's "slug already taken".
        organizationHooks: {
          beforeCreateOrganization: async ({ organization }) => {
            refuseBadOrgSlug(organization.slug)
          },
          beforeUpdateOrganization: async ({ organization }) => {
            if (organization.slug !== undefined) refuseBadOrgSlug(organization.slug)
          },
          afterUpdateOrganization: async ({ organization, user }) => {
            if (!organization) return
            await options.onOrganizationUpdated?.({ organization, user })
          },
          beforeDeleteOrganization: async ({ organization }) => {
            const problem = await options.deleteOrganizationProblem?.(organization.id)
            if (problem) throw new APIError('CONFLICT', { message: problem })
          },
          beforeCreateInvitation: async () => closed(),
          beforeAcceptInvitation: async () => closed(),
          beforeRejectInvitation: async () => closed(),
          beforeCancelInvitation: async () => closed(),
          beforeRemoveMember: async () => closed(),
          beforeUpdateMemberRole: async () => closed(),
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (CLOSED_PATHS.has(ctx.path)) closed()
      }),
    },
    user: {
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      // Every name lands in the audit log and in front of other people: it
      // carries no controls or direction overrides, and has a length.
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, name: personName(user.name ?? '').slice(0, MAX_PERSON_NAME) },
          }),
        },
        update: {
          before: async (user) => {
            if (typeof user.name !== 'string') return { data: user }
            const name = personName(user.name)
            if (name.length > MAX_PERSON_NAME) {
              throw new APIError('BAD_REQUEST', {
                message: `Names are at most ${MAX_PERSON_NAME} characters`,
              })
            }
            return { data: { ...user, name } }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await options.onSessionCreated?.(session)
          },
        },
      },
    },
    // The address the app resolved under its trust policy, set on every
    // request in app.ts — never a forwarding header a client could choose.
    advanced: {
      ipAddress: {
        ipAddressHeaders: [CLIENT_IP_HEADER],
      },
    },
    // better-auth's defaults already guard sign-in, sign-up and the
    // password/email-change paths (3 per 10s). Two need a tighter budget:
    // every magic-link request sends an email to whatever address it names,
    // and organization creation writes rows — both were 5/min under the
    // app-level limiter this replaced, and 18/min and 600/min without these.
    rateLimit: {
      enabled: options.rateLimit ?? true,
      customRules: {
        '/sign-in/magic-link': { window: 60, max: 5 },
        '/organization/create': { window: 60, max: 10 },
      },
    },
    socialProviders: {
      ...(options.github && {
        github: {
          clientId: options.github.clientId,
          clientSecret: options.github.clientSecret,
        },
      }),
      ...(options.google && {
        google: {
          clientId: options.google.clientId,
          clientSecret: options.google.clientSecret,
        },
      }),
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
