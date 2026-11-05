import type { StepManifest } from '@awaitstep/codegen'

/**
 * The step manifest pinned into a deployment's config snapshot at deploy
 * time (routes/deploy.ts). Tolerant of snapshots that predate manifests or
 * were written by other code paths: anything that is not a well-formed
 * manifest reads as absent.
 */
export function parseStepManifest(configSnapshot: string | null): StepManifest | undefined {
  if (!configSnapshot) return undefined
  try {
    const parsed = JSON.parse(configSnapshot) as { stepManifest?: StepManifest }
    return parsed.stepManifest && Array.isArray(parsed.stepManifest.steps)
      ? parsed.stepManifest
      : undefined
  } catch {
    return undefined
  }
}

/** memberNodeId → leaderNodeId for nodes whose code ran inside a merged step. */
export function coalescedMembers(manifest: StepManifest | undefined): Record<string, string> {
  // No prototype: a node id of `__proto__` would otherwise be dropped.
  const links: Record<string, string> = Object.create(null)
  for (const entry of manifest?.steps ?? []) {
    if (entry.coalescedInto) links[entry.nodeId] = entry.coalescedInto
  }
  return links
}
