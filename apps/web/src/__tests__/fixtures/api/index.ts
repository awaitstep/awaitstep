import type { AccountSession, ApiAccount, ProjectSetup } from '@awaitstep/ir'
import type {
  ApiInviteView,
  ApiOrg,
  ApiOrgListing,
  ApiPendingInvite,
  ApiProject,
  ApiWorkspace,
} from '../../../lib/dashboard-api'
import { accounts, sessions } from './account'
import { ACCEPTED, inviteViews, myInvites } from './invites'
import { amaOrgListings, amaOrgs } from './orgs'
import type { PersonId } from './people'
import { amaProjects, amaWorkspaces } from './places'
import { PROJECT_SETUP } from './setup'
import { seedDb } from '../seed'
import { workspaceCounts } from './workflows'
import type { SeedDb } from '../seed/rows'

export * from './clock'
export * from './people'
export { ACME, BOLT, GLOBEX, SANDBOX } from './orgs'
export { BOLT_API, INTERNAL, IT, MARKETING, P101, SALES, SUPPORT } from './places'
export { authSession } from './auth'
export { accountExport } from './account'

/**
 * The fake API's base data: real API JSON, keyed the way a request names it.
 * Built fresh for every test; a test changes what the API answers by editing
 * these (or by overriding the route).
 */
export interface FakeApiData {
  /** `GET /scope`: `org` slug → the org, as the default viewer (Ama) sees it. */
  orgs: Record<string, ApiOrg>
  /** `GET /scope`: `org/project` → the project. */
  projects: Record<string, ApiProject>
  /** `GET /scope`: `org/project/workspace` → the workspace. */
  workspaces: Record<string, ApiWorkspace>
  /** `GET /orgs`, by viewer. */
  orgListings: Partial<Record<PersonId, ApiOrgListing[]>>
  /** `GET /account`, by viewer. */
  accounts: Partial<Record<PersonId, ApiAccount>>
  /** `GET /account/sessions`, by viewer. */
  sessions: Partial<Record<PersonId, AccountSession[]>>
  /** `GET /invitations/:token`, by token. */
  inviteViews: Record<string, ApiInviteView>
  /** `POST /invitations/:token/accept`, by token. */
  acceptedInvites: Record<string, { org: string; project?: string; workspace?: string }>
  /** `GET /me/invitations`, by viewer. */
  myInvites: Partial<Record<PersonId, ApiPendingInvite[]>>
  /** `GET /projects/:id/setup`, by project id. */
  projectSetup: Record<string, ProjectSetup>
  /**
   * The sample tables the other domains' answers are projected from (workflows,
   * runs, members, keys…): edit a row to change what those routes answer.
   */
  seed: SeedDb
}

export function createApiFixtures(now: Date): FakeApiData {
  const seed = seedDb(now)
  const workspaces = amaWorkspaces(now)
  // The scope's counts agree with the lists the seed answers.
  for (const workspace of Object.values(workspaces)) {
    if (seed.workspaces.some((w) => w.id === workspace.id)) {
      workspace.counts = workspaceCounts(seed, workspace.id, now)
    }
  }
  return structuredClone({
    orgs: amaOrgs(now),
    projects: amaProjects(now),
    workspaces,
    orgListings: { usr_ama: amaOrgListings(now) },
    accounts: accounts(now),
    sessions: sessions(now),
    inviteViews: inviteViews(now),
    acceptedInvites: ACCEPTED,
    myInvites: myInvites(now),
    projectSetup: PROJECT_SETUP,
    seed,
  })
}
