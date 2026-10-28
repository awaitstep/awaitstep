// Workspace facts shared by the API, the dashboard and the dummy server.

/** The preset swatches a workspace is tinted with; the first is the default. */
export const WORKSPACE_COLOURS = ['green', 'blue', 'amber', 'purple', 'rose'] as const

export type WorkspaceColour = (typeof WORKSPACE_COLOURS)[number]

export function isWorkspaceColour(value: unknown): value is WorkspaceColour {
  return (WORKSPACE_COLOURS as readonly unknown[]).includes(value)
}
