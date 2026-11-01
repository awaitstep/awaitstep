import type { FileOwner } from './project'

export interface Editability {
  readOnly: boolean
  /** Why edits are refused, worded for the user; null when editing is allowed. */
  message: string | null
}

export interface WorkspaceContext {
  /** `?version=` points at an older version than the current one. */
  historical: boolean
}

const EDITABLE: Editability = { readOnly: false, message: null }

/**
 * Whether the workspace as a whole accepts edits: only the current version
 * does. Older versions are frozen — they deploy the snapshot they were
 * saved with, so an edit there would have nowhere to land.
 */
export function workspaceEditability(ctx: WorkspaceContext): Editability {
  if (ctx.historical) {
    return {
      readOnly: true,
      message: 'Older versions are read-only. Open the latest to edit.',
    }
  }
  return EDITABLE
}

/**
 * Per-file editability: project files follow the workspace, generated
 * files never accept edits (the canvas would overwrite them on the next
 * save) — put the code in a project file instead.
 */
export function fileEditability(owner: FileOwner, workspace: Editability): Editability {
  if (owner === 'generated') {
    return {
      readOnly: true,
      message: 'Generated from the canvas. Put your code in a project file instead.',
    }
  }
  return workspace
}
