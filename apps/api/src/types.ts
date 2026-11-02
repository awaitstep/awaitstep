import type { DatabaseAdapter, Workflow, Connection, WorkspaceChip } from '@awaitstep/db'
import type { Budget } from './middleware/rate-limit.js'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { TestSessionRunner } from '@awaitstep/codegen'
import type { ImageStore } from '@awaitstep/storage'
import type { TestSessionLimits } from './lib/test-session-policy.js'
import type { AppNodeRegistry } from './lib/node-registry.js'
import type { RemoteNodeRegistry } from './lib/remote-node-registry.js'
import type {
  AccountProviders,
  KeyLevel,
  KeyPermissions,
  OrgRole,
  ProjectRole,
  WorkspaceRole,
} from '@awaitstep/ir'

/**
 * The calling API key, as auth resolved it (B3): its level, the grid it
 * carries and, for a workspace key, the workspace it is pinned to. Null for
 * a session.
 */
export interface ApiKeyContext {
  id: string
  /** The key's name and its "ask_p1…a71d" form, for the audit log (B7). */
  name: string
  display: string
  level: KeyLevel
  permissions: KeyPermissions
  /** The project a project or workspace key is pinned to; null for an organization key. */
  projectId: string | null
  workspaceId: string | null
  expiresAt: string | null
}

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

/** To a workspace admin: a Viewer asked them for edit access (B8). */
export interface AccessRequestEmail {
  to: string
  url: string
  askerName: string
  workspaceName: string
  projectName: string
}

/** To a workflow's watchers: a run failed, the first time in its hour (B8). */
export interface RunFailedEmail {
  to: string
  url: string
  workflowName: string
  stepName: string | null
  /** "Project 101 · Sales". */
  placeName: string
  projectName?: string
  workspaceName?: string
}

/** How the app sends mail; the entry points decide with what, and may log instead. */
export interface AppEmails {
  /** The web page for an invitation, from its id. */
  inviteUrl(invitationId: string): string
  /** The org's Members page, for the inviter. */
  membersUrl(orgSlug: string): string
  /** The org's Inbox. */
  inboxUrl(orgSlug: string): string
  /** A workspace's Runs page. */
  runsUrl(slugs: { org: string; project: string; workspace: string }): string
  sendInvitation(data: InvitationEmail): Promise<void>
  sendInviteRequest(data: InviteRequestEmail): Promise<void>
  sendAccessRequest(data: AccessRequestEmail): Promise<void>
  sendRunFailed(data: RunFailedEmail): Promise<void>
}

export interface AppEnv {
  Variables: {
    db: DatabaseAdapter
    userId: string
    organizationId: string
    projectId: string
    /** Set by requireProject when the request names a workspace, and by requireWorkspace. */
    workspaceId: string | undefined
    /** The named workspace as the dashboard draws it, from the same read; set by requireProject only. */
    workspace: WorkspaceChip | undefined
    /** The names of the project and workspace the scope middleware resolved, for the audit log. */
    projectName: string | undefined
    workspaceName: string | undefined
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
    apiKey: ApiKeyContext | null
    /**
     * Set by the permission mapping a route carries once it has judged the
     * key; the catch-all registered after every mapping refuses a key whose
     * request none marked, so a route is session-only until mapped.
     */
    keyPermissionChecked: boolean | undefined
    nodeRegistry: AppNodeRegistry
    remoteNodeRegistry: RemoteNodeRegistry | undefined
    appName: string | undefined
    /** Which ways in the instance turns on, for Your account (B10). */
    accountProviders: AccountProviders | undefined
    deployer: WranglerDeployer | undefined
    testSessionRunner: TestSessionRunner | undefined
    testSessionLimits: TestSessionLimits
    emails: AppEmails | undefined
    /** Where uploaded photos' and logos' bytes live, as the entry point chose. */
    imageStore: ImageStore
    /** The caller's invitation-email budget (set on the invitation routes). */
    emailBudget: Budget | undefined
  }
}
