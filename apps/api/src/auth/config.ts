import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { magicLink, organization } from 'better-auth/plugins'
import { CLIENT_IP_HEADER } from '../lib/client-ip.js'
import { orgSlugProblem } from '../lib/slugs.js'

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
}

function refuseBadOrgSlug(slug: unknown): void {
  const problem = orgSlugProblem(slug)
  if (problem) throw new APIError('BAD_REQUEST', { message: problem })
}

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
        },
      }),
    ],
    user: {
      deleteUser: { enabled: true },
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
