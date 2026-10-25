import { betterAuth } from 'better-auth'
import { magicLink, organization } from 'better-auth/plugins'
import { CLIENT_IP_HEADER } from '../lib/client-ip.js'

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
        // Org name is user-facing and may collide across tenants (two users
        // can both have an "ABC" org). The `slug` column is globally unique
        // for URL routing, so we append a short random suffix to keep slugs
        // unique while letting users pick whatever name they want.
        organizationCreation: {
          beforeCreate: async ({
            organization,
          }: {
            organization: { name?: string; slug?: string; [k: string]: unknown }
          }) => {
            const rand = crypto.randomUUID().slice(0, 6)
            const base =
              (organization.slug || organization.name || 'org')
                .toString()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 32) || 'org'
            return { data: { ...organization, slug: `${base}-${rand}` } }
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
