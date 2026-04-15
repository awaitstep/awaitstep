import { betterAuth } from 'better-auth'
import { magicLink, organization } from 'better-auth/plugins'

export interface AuthOptions {
  baseURL: string
  secret: string
  database: unknown
  trustedOrigins?: string[]
  github?: { clientId: string; clientSecret: string }
  google?: { clientId: string; clientSecret: string }
  sendMagicLink?: (data: { email: string; url: string; token: string }) => Promise<void>
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
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'],
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
