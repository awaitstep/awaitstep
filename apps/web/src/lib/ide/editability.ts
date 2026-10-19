import type { SourceMode } from '@awaitstep/codegen'
import type { FileOwner } from './project'

export interface Editability {
  readOnly: boolean
  /** Why edits are refused, worded for the user; null when editing is allowed. */
  message: string | null
}

export interface WorkspaceContext {
  sourceMode: SourceMode
  /** `?version=` points at an older version than the current one. */
  historical: boolean
}

const EDITABLE: Editability = { readOnly: false, message: null }

/**
 * Whether the workspace as a whole accepts edits: only the current version
 * of a canvas-owned (generated) workflow does. Older versions are frozen,
 * and an ejected version owns its stored source, which is edited through
 * the source API.
 */
export function workspaceEditability(ctx: WorkspaceContext): Editability {
  if (ctx.historical) {
    return {
      readOnly: true,
      message: 'Older versions are read-only — open the latest version to edit.',
    }
  }
  switch (ctx.sourceMode) {
    case 'generated':
      return EDITABLE
    case 'ejected':
    case 'sdk':
      return {
        readOnly: true,
        message: 'This version is ejected and owns its source; edit it through PUT /source.',
      }
  }
}

/**
 * Per-file editability: project files follow the workspace, generated
 * files never accept edits (the canvas would overwrite them on the next
 * save) — put the code in a project file or eject instead.
 */
export function fileEditability(owner: FileOwner, workspace: Editability): Editability {
  if (owner === 'generated') {
    return {
      readOnly: true,
      message:
        'Generated from the canvas — put your code in a project file, or eject to take over the generated source.',
    }
  }
  return workspace
}
