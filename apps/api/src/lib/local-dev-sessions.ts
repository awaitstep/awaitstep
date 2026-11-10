/** The one local-dev process a host can run, and who started it. */
export interface LocalDevSession {
  workflowId: string
  organizationId: string
  provider: string
  /** How the session was opened: the canvas or the code workspace. */
  mode: 'canvas' | 'ide'
  port: number | null
  url: string | null
  pid: number | null
  startedAt: string
  warnings: string[]
}

function session(input: {
  workflowId: string
  organizationId: string
  provider: string
  mode?: 'canvas' | 'ide'
}): LocalDevSession {
  return {
    ...input,
    mode: input.mode ?? 'canvas',
    port: null,
    url: null,
    pid: null,
    startedAt: new Date().toISOString(),
    warnings: [],
  }
}

let active: LocalDevSession | null = null

export type ClaimResult =
  { ok: true; replaced: boolean; session: LocalDevSession } | { ok: false; active: LocalDevSession }

/** Claim the host's single local-dev slot for a workflow. */
export function claimLocalDevSession(input: {
  workflowId: string
  organizationId: string
  provider: string
  mode?: 'canvas' | 'ide'
}): ClaimResult {
  if (
    active &&
    (active.workflowId !== input.workflowId || active.organizationId !== input.organizationId)
  ) {
    return { ok: false, active }
  }
  const replaced = active !== null
  active = session(input)
  return { ok: true, replaced, session: active }
}

/** Record the process once the provider has started it. */
export function recordLocalDevRuntime(
  workflowId: string,
  organizationId: string,
  runtime: { port: number; url: string; pid: number; warnings?: string[] },
): LocalDevSession | null {
  if (!currentLocalDevSession(workflowId, organizationId)) return null
  active = { ...active!, ...runtime, warnings: runtime.warnings ?? [] }
  return active
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
