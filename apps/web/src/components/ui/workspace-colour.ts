export const WORKSPACE_COLOURS = ['green', 'blue', 'amber', 'purple', 'rose'] as const

/** One of the preset swatches a workspace is tinted with. */
export type WorkspaceColour = (typeof WORKSPACE_COLOURS)[number]

/** Background + foreground classes for a solid workspace tile. */
export const WORKSPACE_TILE_CLASS: Record<WorkspaceColour, string> = {
  green: 'bg-workspace-green text-workspace-green-foreground',
  blue: 'bg-workspace-blue text-workspace-blue-foreground',
  amber: 'bg-workspace-amber text-workspace-amber-foreground',
  purple: 'bg-workspace-purple text-workspace-purple-foreground',
  rose: 'bg-workspace-rose text-workspace-rose-foreground',
}
