import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink, organization } from 'better-auth/plugins'
import { CLIENT_IP_HEADER } from '../lib/client-ip.js'
import { orgSlugProblem } from '../lib/slugs.js'
import { ONLY_WAY_IN, stripUnsafeText, type AccountProviders } from '@awaitstep/ir'
import { isProviderImageUrl } from '@awaitstep/storage'

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
  /**
   * Why this person may not delete their account right now (the orgs they
   * own alone), or null. Read by the deletion hook; without it anyone may.
   */
  deleteUserProblem?: (userId: string) => Promise<string | null>
  /**
   * The person's own account changed — a provider connected or disconnected,
   * the account about to be deleted — for the audit log (B10). Deletion is
   * reported before it happens, while their memberships still say where.
   */
  onAccountEvent?: (event: AccountEvent) => Promise<void>
  /**
   * An account or organization was deleted: its uploaded images go too.
   * Called after the deletion; a failure is the callee's to log.
   */
  onImageOwnerDeleted?: (owner: { kind: 'user' | 'org'; id: string }) => Promise<void>
}

export interface AccountEvent {
  event: 'account.method_connect' | 'account.method_disconnect' | 'account.delete'
  userId: string
  provider?: string
  /** The resolved client address, when the event came with a request. */
  ip?: string | null
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

// Photos and logos are uploaded through `PUT /api/account/photo` and
// `PUT /api/orgs/:orgId/logo`, which check the bytes and store them. Through
// better-auth an image may only be cleared: any other value — a data URL, a
// remote URL that could track whoever views it — is refused.
function refuseImageValue(value: unknown, what: 'photo' | 'logo', route: string): void {
  if (value === undefined || value === null || value === '') return
  throw new APIError('BAD_REQUEST', { message: `Upload the ${what} with PUT ${route}` })
}

const PHOTO_ROUTE = '/api/account/photo'
const LOGO_ROUTE = '/api/orgs/:orgId/logo'

/** The address app.ts resolved for this request, as better-auth's hooks see it. */
function requestIp(request: Request | undefined): string | null {
  return request?.headers.get(CLIENT_IP_HEADER) ?? null
}

// Members and invitations are managed through this API's own routes
// (`/api/members`, `/api/invitations`), which write the project and
// workspace rows better-auth knows nothing about, in one unit with the
// member row. Its own endpoints for them are closed, so there is one path.
// `addMember` has no hook here: better-auth calls it for the creator of a
// new organization, and closing it closed organization creation.
const USE_THE_API = 'Members and invitations are managed through the AwaitStep API'

const USE_THE_ACCOUNT_API =
  'Not available: sessions and your account are managed through /api/account'

function closed(): never {
  throw new APIError('FORBIDDEN', { message: USE_THE_API })
}

// Leaving has no organization hook, so it is closed at the request: a
// member's rows below the organization must go with the member row, which
// `/organization/leave` would not do — `POST /api/account/orgs/:id/leave`
// does (B10). The two reads that hand every member the organization's
// pending invitations — whose ids are the invite links — are closed the same
// way; this API lists invitations to owners and admins.
//
// Sessions are listed and signed out through `/api/account/sessions` by id:
// better-auth's own session routes hand the browser every session's bearer
// token and take one back to revoke it; `/update-session` answers the same
// object (and no session field takes input). The provider-token reads hand
// script the person's own GitHub or Google tokens, which nothing here uses.
// The delete-account callback goes too: nothing here mails a deletion link,
// so it could only be a second way in.
const CLOSED_PATHS = new Set([
  '/organization/leave',
  '/organization/get-full-organization',
  '/organization/list-invitations',
  // The member roster with every address in it: `/api/members?org=` answers
  // that for a person, and sends an address only where the viewer may see it.
  '/organization/list-members',
])

/** Your account's closed paths (B10), with a refusal that says where to go instead. */
const CLOSED_ACCOUNT_PATHS = new Set([
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/update-session',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  '/delete-user/callback',
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
            refuseImageValue(organization.logo, 'logo', LOGO_ROUTE)
          },
          beforeUpdateOrganization: async ({ organization }) => {
            if (organization.slug !== undefined) refuseBadOrgSlug(organization.slug)
            refuseImageValue(organization.logo, 'logo', LOGO_ROUTE)
          },
          afterUpdateOrganization: async ({ organization, user }) => {
            if (!organization) return
            await options.onOrganizationUpdated?.({ organization, user })
          },
          beforeDeleteOrganization: async ({ organization }) => {
            const problem = await options.deleteOrganizationProblem?.(organization.id)
            if (problem) throw new APIError('CONFLICT', { message: problem })
          },
          afterDeleteOrganization: async ({ organization }) => {
            await options.onImageOwnerDeleted?.({ kind: 'org', id: organization.id })
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
        if (CLOSED_ACCOUNT_PATHS.has(ctx.path)) {
          throw new APIError('FORBIDDEN', { message: USE_THE_ACCOUNT_API })
        }
      }),
      // The session object carries its bearer token, and the cookie is
      // httpOnly for a reason: the answer the browser reads leaves it out.
      // The raw client address is the account page's to show, masked.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/get-session') return
        const returned = ctx.context.returned as { session?: Record<string, unknown> } | null
        if (!returned || typeof returned !== 'object' || !returned.session) return
        const { token: _token, ipAddress: _ipAddress, ...session } = returned.session
        return ctx.json({ ...returned, session })
      }),
    },
    // The email address is the account (B10): it never changes, and Google or
    // GitHub join it only with that same, verified address — at sign-in
    // (implicit linking, better-auth's default) and from Sessions and
    // sign-in (`allowDifferentEmails` stays off). With magic links on, the
    // address alone still signs in, so the last provider may be disconnected;
    // without them it stays, and the way out is deleting the account.
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: Boolean(options.sendMagicLink),
      },
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: {
        enabled: true,
        // The only owner of an organization can't leave it ownerless.
        // better-auth's fresh-session rule (signed in within a day) stays.
        beforeDelete: async (user, request) => {
          const problem = await options.deleteUserProblem?.(user.id)
          if (problem) throw new APIError('CONFLICT', { message: problem })
          await options.onAccountEvent?.({
            event: 'account.delete',
            userId: user.id,
            ip: requestIp(request),
          })
        },
        afterDelete: async (user) => {
          await options.onImageOwnerDeleted?.({ kind: 'user', id: user.id })
        },
      },
    },
    databaseHooks: {
      // Every name lands in the audit log and in front of other people: it
      // carries no controls or direction overrides, and has a length.
      user: {
        create: {
          // The one image a new account may bring is its GitHub or Google
          // avatar; any other is dropped rather than refused, so a sign-up
          // never fails over a photo.
          before: async (user) => ({
            data: {
              ...user,
              name: personName(user.name ?? '').slice(0, MAX_PERSON_NAME),
              image:
                typeof user.image === 'string' && isProviderImageUrl(user.image)
                  ? user.image
                  : null,
            },
          }),
        },
        update: {
          before: async (user) => {
            // No path changes an address (B10), better-auth's or a later one.
            if (user.email !== undefined) {
              throw new APIError('BAD_REQUEST', { message: "Email addresses can't be changed" })
            }
            // Providers' photos are URLs set at sign-up; an upload has its own route.
            refuseImageValue(user.image, 'photo', PHOTO_ROUTE)
            if (user.name === undefined) return { data: user }
            if (typeof user.name !== 'string') {
              throw new APIError('BAD_REQUEST', { message: 'A name is text' })
            }
            const name = personName(user.name)
            if (name === '')
              throw new APIError('BAD_REQUEST', { message: "Your name can't be empty" })
            if (name.length > MAX_PERSON_NAME) {
              throw new APIError('BAD_REQUEST', {
                message: `Names are at most ${MAX_PERSON_NAME} characters`,
              })
            }
            return { data: { ...user, name } }
          },
        },
      },
      account: {
        create: {
          after: async (account, context) => {
            if (account.providerId !== 'github' && account.providerId !== 'google') return
            await options.onAccountEvent?.({
              event: 'account.method_connect',
              userId: account.userId,
              provider: account.providerId,
              ip: requestIp(context?.request),
            })
          },
        },
        // Only a disconnect: deleting the person removes their accounts too,
        // through the same delete, and that is recorded as the deletion.
        delete: {
          // Rule B: better-auth counts linked rows, but a provider the
          // instance turned off signs no one in — so the last way in that
          // still works stays, unless the email link does.
          before: async (account, context) => {
            if (context?.path !== '/unlink-account' || options.sendMagicLink) return
            const linked = await context.context.internalAdapter.findAccounts(account.userId)
            const providers = accountProvidersOf(options)
            const stays = linked.some(
              (other) =>
                other.id !== account.id &&
                (other.providerId === 'github' || other.providerId === 'google') &&
                providers[other.providerId],
            )
            if (!stays) throw new APIError('BAD_REQUEST', { message: ONLY_WAY_IN })
          },
          after: async (account, context) => {
            if (context?.path !== '/unlink-account') return
            if (account.providerId !== 'github' && account.providerId !== 'google') return
            await options.onAccountEvent?.({
              event: 'account.method_disconnect',
              userId: account.userId,
              provider: account.providerId,
              ip: requestIp(context.request),
            })
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

/** Which ways in these options turn on, as Your account lists them. */
export function accountProvidersOf(
  options: Pick<AuthOptions, 'github' | 'google' | 'sendMagicLink'>,
): AccountProviders {
  return {
    github: Boolean(options.github),
    google: Boolean(options.google),
    emailLink: Boolean(options.sendMagicLink),
  }
}
