import type { WorkspaceColour } from '../../components/ui/workspace-colour'

// Dashboard types for the org audit log. Web-only until B7 (S1c) moves them.

/** Sets the row's icon and tint. */
export type AuditKind = 'danger' | 'key' | 'access' | 'deploy' | 'auth' | 'lock'

export type AuditLevel = 'organization' | 'project' | 'workspace'

export interface AuditEvent {
  id: string
  at: string
  kind: AuditKind
  /** A person, an API key's name, or "Unknown" for a failed sign-in. */
  actor: string
  /** "tried to delete the workspace", "deployed". */
  action: string
  /** "IT", "Lead enrichment v12". */
  target: string
  /** How, and from where: "Blocked by the deletion lock · 81.2.69.x". */
  detail: string
  scope: {
    level: AuditLevel
    /** "Acme Inc", "Project 101", "Project 101 · Sales". */
    name: string
    /** The workspace's colour, for workspace-level events. */
    colour?: WorkspaceColour
  }
}
