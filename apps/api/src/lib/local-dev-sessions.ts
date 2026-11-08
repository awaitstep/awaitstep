/** The one local-dev process a host can run, and who started it. */
export interface LocalDevSession {
  workflowId: string
  organizationId: string
  provider: string
}

let active: LocalDevSession | null = null

export type ClaimResult = { ok: true; replaced: boolean } | { ok: false; active: LocalDevSession }

/** Claim the host's single local-dev slot for a workflow. */
export function claimLocalDevSession(session: LocalDevSession): ClaimResult {
  if (
    active &&
    (active.workflowId !== session.workflowId || active.organizationId !== session.organizationId)
  ) {
    return { ok: false, active }
  }
  const replaced = active !== null
  active = session
  return { ok: true, replaced }
}

/** The session only when the addressed workflow and org own it. */
export function currentLocalDevSession(
  workflowId: string,
  organizationId: string,
): LocalDevSession | null {
  return active?.workflowId === workflowId && active.organizationId === organizationId
    ? active
    : null
}

/** Release only the matching session; another workflow's release is a no-op. */
export function releaseLocalDevSession(
  workflowId: string,
  organizationId: string,
): LocalDevSession | null {
  if (!currentLocalDevSession(workflowId, organizationId)) return null
  const released = active
  active = null
  return released
}

/** The active session, for process-shutdown cleanup only. */
export function activeLocalDevSession(): LocalDevSession | null {
  return active
}

/** Test hook. */
export function resetLocalDevSession(): void {
  active = null
}
