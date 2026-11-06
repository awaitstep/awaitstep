function parseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * True when `handlers/scheduled.ts` exists but nothing would run it: the
 * workflow's own trigger is not a schedule and the deployment config names no
 * cron. The deploy refuses exactly this, so the editor says so first.
 */
export function scheduleMissing(input: {
  hasScheduledModule: boolean
  /** The deployment config as stored (JSON text). */
  deployConfig: string | null | undefined
  /** The open version's graph as stored (JSON text); null before the first save. */
  ir: string | null | undefined
}): boolean {
  if (!input.hasScheduledModule) return false
  const crons = parseObject(input.deployConfig)?.cronTriggers
  if (Array.isArray(crons) && crons.length > 0) return false
  const trigger = parseObject(input.ir)?.trigger
  const type =
    trigger !== null && typeof trigger === 'object'
      ? (trigger as { type?: unknown }).type
      : undefined
  return type !== 'cron'
}
