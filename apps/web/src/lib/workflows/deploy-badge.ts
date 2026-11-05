export type DeployBadgeTone = 'success' | 'warning'

export interface DeployBadge {
  label: string
  tone: DeployBadgeTone
}

/**
 * The deploy state both editing surfaces show beside the name: what is live,
 * and whether a newer saved version is waiting. Null when nothing is deployed.
 */
export function deployBadge({
  hasActiveDeployment,
  hasUndeployedChanges,
  deployedVersion,
  currentVersion,
}: {
  hasActiveDeployment: boolean
  hasUndeployedChanges: boolean | string | undefined
  deployedVersion: number | undefined
  currentVersion: number
}): DeployBadge | null {
  if (!hasActiveDeployment) return null
  if (hasUndeployedChanges) {
    return {
      label: `deployed v${deployedVersion ?? '?'} · v${currentVersion} not deployed`,
      tone: 'warning',
    }
  }
  return { label: `deployed v${currentVersion}`, tone: 'success' }
}
