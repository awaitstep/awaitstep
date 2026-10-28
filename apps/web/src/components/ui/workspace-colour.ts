import type { WorkspaceColour } from '@awaitstep/ir'

// The swatch list is in @awaitstep/ir, where the API validates it; this file maps each one to its classes.
export { WORKSPACE_COLOURS, type WorkspaceColour } from '@awaitstep/ir'

/** Background + foreground classes for a solid workspace tile. */
export const WORKSPACE_TILE_CLASS: Record<WorkspaceColour, string> = {
  green: 'bg-workspace-green text-workspace-green-foreground',
  blue: 'bg-workspace-blue text-workspace-blue-foreground',
  amber: 'bg-workspace-amber text-workspace-amber-foreground',
  purple: 'bg-workspace-purple text-workspace-purple-foreground',
  rose: 'bg-workspace-rose text-workspace-rose-foreground',
}

/** Tile classes for a scope: its workspace swatch, or neutral for projects. */
export function scopeTileColourClass(colour?: WorkspaceColour): string {
  return colour ? WORKSPACE_TILE_CLASS[colour] : 'bg-muted text-foreground'
}

/** Background class for a workspace's colour square (no text on it). */
export const WORKSPACE_DOT_CLASS: Record<WorkspaceColour, string> = {
  green: 'bg-workspace-green',
  blue: 'bg-workspace-blue',
  amber: 'bg-workspace-amber',
  purple: 'bg-workspace-purple',
  rose: 'bg-workspace-rose',
}

/** A card header tinted with a workspace's colour, as on the project and workspace cards. */
export const WORKSPACE_TINT_CLASS: Record<WorkspaceColour, string> = {
  green: 'bg-workspace-green/15 border-workspace-green/40',
  blue: 'bg-workspace-blue/15 border-workspace-blue/40',
  amber: 'bg-workspace-amber/15 border-workspace-amber/40',
  purple: 'bg-workspace-purple/15 border-workspace-purple/40',
  rose: 'bg-workspace-rose/15 border-workspace-rose/40',
}
