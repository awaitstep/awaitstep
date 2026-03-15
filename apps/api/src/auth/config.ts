import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'

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
      magicLink({
        sendMagicLink: options.sendMagicLink ?? (async (data) => {
          console.log(`[Magic Link] ${data.email}: ${data.url}`)
        }),
      }),
    ],
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
