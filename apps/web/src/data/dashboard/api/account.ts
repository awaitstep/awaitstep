import type { ApiAccount } from '@awaitstep/ir'
import { initialOf, initialsOf } from '../../../lib/initials'
import type { Account, SignInMethods } from '../../../types/dashboard/account'

// `GET /account` → Your account's pages. The API decided every rule (only
// owner, delete blocked, which providers are listed); this adds initials.

export function toAccount(row: ApiAccount): Account {
  const { person } = row
  return {
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      initials: initialsOf(person.name, person.email),
      image: person.image,
    },
    emailVerified: person.emailVerified,
    orgs: row.orgs.map((org) => ({ ...org, initial: initialOf(org.name) })),
    deleteBlockedReason: row.deleteBlockedReason,
  }
}

export function toSignInMethods(row: ApiAccount): SignInMethods {
  return {
    methods: row.signInMethods,
    providers: row.providers,
    email: row.person.email,
  }
}
