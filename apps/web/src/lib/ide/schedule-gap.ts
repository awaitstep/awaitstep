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
 * True when `handlers/scheduled.ts` exists but the deployment config names no
 * cron. Schedules are provider deployment config, not IR. The deploy refuses
 * exactly this, so the editor says so first.
 */
export function scheduleMissing(input: {
  hasScheduledModule: boolean
  /** The deployment config as stored (JSON text). */
  deployConfig: string | null | undefined
  /** The provider field holding cron expressions; absent = no schedule support. */
  scheduleConfigKey?: string
}): boolean {
  if (!input.hasScheduledModule || !input.scheduleConfigKey) return false
  const crons = parseObject(input.deployConfig)?.[input.scheduleConfigKey]
  return !(Array.isArray(crons) && crons.length > 0)
}
