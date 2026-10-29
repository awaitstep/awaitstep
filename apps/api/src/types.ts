import type { DatabaseAdapter, Workflow, Connection } from '@awaitstep/db'
import type { Budget } from './middleware/rate-limit.js'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { TestSessionRunner } from '@awaitstep/codegen'
import type { TestSessionLimits } from './lib/test-session-policy.js'
import type { ApiKeyScope } from './middleware/auth.js'
import type { AppNodeRegistry } from './lib/node-registry.js'
import type { RemoteNodeRegistry } from './lib/remote-node-registry.js'
import type { OrgRole, ProjectRole, WorkspaceRole } from '@awaitstep/ir'

/** An invitation email: where the link goes and what the card says. */
export interface InvitationEmail {
  to: string
  url: string
  orgName: string
  inviterName: string
  role: string
  /** "Sales in Project 101 (Editor)", or null for an org-wide role. */
  place: string | null
  expiresAt: string
}

/** The note to an inviter that someone asked for a new invite after theirs expired. */
export interface InviteRequestEmail {
  to: string
  url: string
  orgName: string
  askerEmail: string
}

/** How the app sends mail; the entry points decide with what, and may log instead. */
export interface AppEmails {
  /** The web page for an invitation, from its id. */
  inviteUrl(invitationId: string): string
  /** The org's Members page, for the inviter. */
  membersUrl(orgSlug: string): string
  sendInvitation(data: InvitationEmail): Promise<void>
  sendInviteRequest(data: InviteRequestEmail): Promise<void>
}

export interface AppEnv {
  Variables: {
    db: DatabaseAdapter
    userId: string
    organizationId: string
    projectId: string
    /** Set by requireProject when the request names a workspace, and by requireWorkspace. */
    workspaceId: string | undefined
    /**
     * The caller's role in the organization, from the same read that
     * resolved the scope. For an API key it is the creator's: a key acts with
     * the standing of whoever minted it.
     */
    orgRole: OrgRole | null
    /**
     * The caller's effective roles at the project and workspace the request
     * names, resolved by @awaitstep/ir from the rows the scope read returned.
     * Null where the request names no such level, or they hold no role.
     */
    projectRole: ProjectRole | null
    workspaceRole: WorkspaceRole | null
    user: { id: string; email: string; name?: string; emailVerified?: boolean } | null
    session: { id: string; userId: string; expiresAt: Date } | null
    workflow: Workflow | undefined
    connection: Connection | undefined
    requestId: string
    /** The caller's address, resolved once per request — the rate limiters' key. */
    clientIp: string | undefined
    /** The calling key — recorded as the parent of any key it mints. Null for sessions. */
    apiKeyId: string | null
    apiKeyScopes: ApiKeyScope[] | null
    /** The key's own expiry — the ceiling for any key it mints. Null for sessions. */
    apiKeyExpiresAt: string | null
    nodeRegistry: AppNodeRegistry
    remoteNodeRegistry: RemoteNodeRegistry | undefined
    appName: string | undefined
    deployer: WranglerDeployer | undefined
    testSessionRunner: TestSessionRunner | undefined
    testSessionLimits: TestSessionLimits
    emails: AppEmails | undefined
    /** The caller's invitation-email budget (set on the invitation routes). */
    emailBudget: Budget | undefined
  }
}
