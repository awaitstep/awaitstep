import type { AccountExport, AccountSession, ApiAccount, SignInMethod } from '@awaitstep/ir'
import { daysAgo, minutesAgo } from './clock'
import { ACME, BOLT, SANDBOX } from './orgs'
import { AMA, DANIEL, PEOPLE, PRIYA, type PersonId } from './people'

// Your account (`GET /account`, `/account/sessions`, `POST /account/export`)
// for the people the account pages are tested as. Ama has the AccountSessions
// board's GitHub link and four sessions; everyone else signs in with the email
// link on one device.

const PROVIDERS = { github: true, google: true, emailLink: true }

const EMAIL_LINK: SignInMethod = {
  provider: 'email',
  connected: true,
  connectedAt: null,
  accountId: null,
}

function methods(now: Date, githubDaysAgo: number | null): SignInMethod[] {
  return [
    {
      provider: 'github',
      connected: githubDaysAgo !== null,
      connectedAt: githubDaysAgo === null ? null : daysAgo(now, githubDaysAgo),
      accountId: githubDaysAgo === null ? null : 'acc_ama_github',
    },
    { provider: 'google', connected: false, connectedAt: null, accountId: null },
    EMAIL_LINK,
  ]
}

const person = (id: PersonId): ApiAccount['person'] => ({ ...PEOPLE[id], emailVerified: true })

export function accounts(now: Date): Partial<Record<PersonId, ApiAccount>> {
  return {
    [AMA]: {
      person: person(AMA),
      orgs: [
        {
          id: ACME,
          slug: 'acme',
          name: 'Acme Inc',
          logo: null,
          role: 'owner',
          projectCount: 3,
          onlyOwner: true,
        },
        {
          id: BOLT,
          slug: 'bolt-labs',
          name: 'Bolt Labs',
          logo: null,
          role: 'admin',
          projectCount: 1,
          onlyOwner: false,
        },
      ],
      deleteBlockedReason: "You're the only owner of Acme Inc",
      signInMethods: methods(now, 56),
      providers: PROVIDERS,
    },
    [PRIYA]: {
      person: person(PRIYA),
      orgs: [
        {
          id: ACME,
          slug: 'acme',
          name: 'Acme Inc',
          logo: null,
          role: 'member',
          projectCount: 1,
          onlyOwner: false,
        },
      ],
      deleteBlockedReason: null,
      signInMethods: methods(now, null),
      providers: PROVIDERS,
    },
    [DANIEL]: {
      person: person(DANIEL),
      orgs: [
        {
          id: ACME,
          slug: 'acme',
          name: 'Acme Inc',
          logo: null,
          role: 'member',
          projectCount: 1,
          onlyOwner: false,
        },
        {
          id: SANDBOX,
          slug: 'daniels-sandbox',
          name: 'Daniel’s sandbox',
          logo: null,
          role: 'owner',
          projectCount: 2,
          onlyOwner: true,
        },
      ],
      deleteBlockedReason: "You're the only owner of Daniel’s sandbox",
      signInMethods: methods(now, null),
      providers: PROVIDERS,
    },
  }
}

/** This device first, then the most recently active. */
export function sessions(now: Date): Partial<Record<PersonId, AccountSession[]>> {
  const oneDevice = (id: PersonId): AccountSession[] => [
    {
      id: `ses_${id.replace(/^usr_/, '')}_chrome`,
      device: 'Chrome on macOS',
      kind: 'desktop',
      ip: '192.0.2.x',
      signedInAt: daysAgo(now, 2),
      activeAt: minutesAgo(now, 0),
      current: true,
    },
  ]
  return {
    [AMA]: [
      {
        id: 'ses_ama_chrome',
        device: 'Chrome on macOS',
        kind: 'desktop',
        ip: '81.2.69.x',
        signedInAt: daysAgo(now, 3),
        activeAt: minutesAgo(now, 0),
        current: true,
      },
      {
        id: 'ses_ama_firefox',
        device: 'Firefox on Windows',
        kind: 'desktop',
        ip: '81.2.69.x',
        signedInAt: daysAgo(now, 5),
        activeAt: minutesAgo(now, 120),
        current: false,
      },
      {
        id: 'ses_ama_iphone',
        device: 'Safari on iPhone',
        kind: 'phone',
        ip: '203.0.113.x',
        signedInAt: minutesAgo(now, 30 * 60),
        activeAt: minutesAgo(now, 26 * 60),
        current: false,
      },
      {
        id: 'ses_ama_unknown',
        device: 'Unknown browser',
        kind: 'terminal',
        ip: '198.51.100.x',
        signedInAt: daysAgo(now, 6),
        activeAt: daysAgo(now, 6),
        current: false,
      },
    ],
    [PRIYA]: oneDevice(PRIYA),
    [DANIEL]: oneDevice(DANIEL),
  }
}

/** Download JSON's content, as the API would build it from the rows above. */
export function accountExport(
  now: Date,
  account: ApiAccount,
  ownSessions: AccountSession[],
): AccountExport {
  return {
    exportedAt: now.toISOString(),
    profile: {
      name: account.person.name,
      email: account.person.email,
      photo: account.person.image !== null,
    },
    signInMethods: account.signInMethods,
    sessions: ownSessions,
    memberships: account.orgs.map((org) => ({
      organization: org.name,
      role: org.role,
      projects: [],
      workspaces: [],
    })),
  }
}
