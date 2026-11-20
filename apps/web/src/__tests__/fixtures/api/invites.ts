import type { ApiInviteDetails, ApiInviteView, ApiPendingInvite } from '../../../lib/dashboard-api'
import { daysAgo, daysFrom } from './clock'
import { AMA, DANIEL, LENA, PEOPLE, TOMAS, type PersonId } from './people'

// P9's invite boards, as Daniel opens them: his open Globex invite
// (`AcceptInvite`), his expired Bolt Labs one (`InviteExpired`), and Sam's,
// which isn't his (`InviteWrongAccount`). A token not listed is `gone`.

const DANIEL_EMAIL = PEOPLE[DANIEL].email

const inviter = (id: PersonId): ApiInviteDetails['invitedBy'] => ({ ...PEOPLE[id] })

function globexInvite(now: Date): ApiInviteDetails {
  return {
    token: 'inv_globex_daniel',
    org: { name: 'Globex', slug: 'globex', logo: null },
    invitedBy: inviter(LENA),
    email: DANIEL_EMAIL,
    orgRole: 'member',
    place: { kind: 'workspace', name: 'Default', projectName: 'Globex Ops', role: 'editor' },
    sentAt: daysAgo(now, 2),
    expiresAt: daysFrom(now, 5),
  }
}

/** Token → `GET /invitations/:token`, for Daniel. */
export function inviteViews(now: Date): Record<string, ApiInviteView> {
  return {
    inv_globex_daniel: { state: 'open', invite: globexInvite(now), viewerEmail: DANIEL_EMAIL },
    inv_bolt_daniel: {
      state: 'expired',
      invite: {
        token: 'inv_bolt_daniel',
        org: { name: 'Bolt Labs', slug: 'bolt-labs', logo: null },
        invitedBy: inviter(TOMAS),
        email: DANIEL_EMAIL,
        orgRole: 'member',
        place: { kind: 'project', name: 'Bolt API', role: 'member' },
        sentAt: daysAgo(now, 10),
        expiresAt: daysAgo(now, 3),
      },
      askedForNew: false,
    },
    inv_sam: {
      state: 'wrong-account',
      invite: {
        token: 'inv_sam',
        org: { name: 'Acme Inc', slug: 'acme', logo: null },
        invitedBy: inviter(AMA),
        email: 'sam@acme.test',
        orgRole: 'member',
        place: { kind: 'workspace', name: 'IT', projectName: 'Project 101', role: 'editor' },
        sentAt: daysAgo(now, 2),
        expiresAt: daysFrom(now, 5),
      },
      viewerEmail: DANIEL_EMAIL,
    },
  }
}

/** `POST /invitations/:token/accept`: where the invite lands. */
export const ACCEPTED: Record<string, { org: string; project?: string; workspace?: string }> = {
  inv_globex_daniel: { org: 'globex', project: 'globex-ops', workspace: 'default' },
}

/** `GET /me/invitations`: the open ones waiting for the viewer. */
export function myInvites(now: Date): Partial<Record<PersonId, ApiPendingInvite[]>> {
  const globex = globexInvite(now)
  return {
    [DANIEL]: [
      {
        token: globex.token,
        org: globex.org,
        invitedBy: globex.invitedBy.name,
        orgRole: globex.orgRole,
        place: globex.place,
        expiresAt: globex.expiresAt,
      },
    ],
  }
}
