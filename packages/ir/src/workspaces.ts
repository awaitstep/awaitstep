// Workspace facts shared by the API, the dashboard and the dummy server.

/** The preset swatches a workspace is tinted with; the first is the default. */
export const WORKSPACE_COLOURS = ['green', 'blue', 'amber', 'purple', 'rose'] as const

export type WorkspaceColour = (typeof WORKSPACE_COLOURS)[number]

export function isWorkspaceColour(value: unknown): value is WorkspaceColour {
  return (WORKSPACE_COLOURS as readonly unknown[]).includes(value)
}

/** One hour of a workspace's runs, for the Overview's runs strip. */
export interface RunHour {
  /** Runs that started in the hour. */
  runs: number
  /** Of those, how many finished well. */
  complete: number
  /** Of those, how many errored or were terminated. */
  failed: number
}
