import type { SessionData } from '../../../stores/auth-store'
import { daysAgo, daysFrom } from './clock'
import { PEOPLE, type PersonId } from './people'

/** better-auth's `GET /auth/get-session` for `id`: what the app's auth store holds. */
export function authSession(now: Date, id: PersonId): SessionData {
  const person = PEOPLE[id]
  const created = new Date(daysAgo(now, 30))
  return {
    user: {
      id: person.id,
      name: person.name,
      email: person.email,
      emailVerified: true,
      image: person.image,
      createdAt: created,
      updatedAt: created,
    },
    session: {
      id: `ses_${id.replace(/^usr_/, '')}_chrome`,
      userId: person.id,
      token: `token_${id}`,
      expiresAt: new Date(daysFrom(now, 7)),
      createdAt: new Date(daysAgo(now, 3)),
      updatedAt: new Date(daysAgo(now, 3)),
      ipAddress: null,
      userAgent: null,
    },
  }
}
