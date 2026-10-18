import type { SourceMode } from '@awaitstep/codegen'

export interface Editability {
  readOnly: boolean
  /** Why edits are refused, worded for the user; null when editing is allowed. */
  message: string | null
}

/**
 * The one place that decides whether the workspace may edit a version's
 * source. Generated source is owned by the canvas (eject to take it over);
 * stored ejected/sdk source becomes editable when the project-files slice
 * lands, so for now every mode is read-only but says why in its own words.
 */
export function describeEditability(mode: SourceMode): Editability {
  switch (mode) {
    case 'generated':
      return {
        readOnly: true,
        message: 'Generated source is read-only — eject the workflow to edit it.',
      }
    case 'ejected':
    case 'sdk':
      return {
        readOnly: true,
        message: 'Editing stored source in the code workspace is not available yet.',
      }
  }
}
