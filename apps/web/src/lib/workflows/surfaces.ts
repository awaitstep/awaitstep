/** The two ways to edit a workflow. Peers, not a page and a side trip. */
export const WORKSPACE_SURFACES = ['canvas', 'ide'] as const
export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number]

/** What an editor URL without `?view=` opens — valid even before a first save. */
export const DEFAULT_SURFACE: WorkspaceSurface = 'canvas'

const SURFACE_LABELS: Readonly<Record<WorkspaceSurface, string>> = {
  canvas: 'Canvas',
  ide: 'Code',
}

export function parseSurface(value: unknown): WorkspaceSurface {
  return WORKSPACE_SURFACES.find((surface) => surface === value) ?? DEFAULT_SURFACE
}

export interface EditorSearch {
  view: WorkspaceSurface
  version?: string
  file?: string
}

/**
 * The editor's search params for a view, carrying only what was given.
 * Moving within the editor drops everything else (`template`, `kind`, a
 * stale `file`), so each caller states exactly what the destination needs.
 */
export function editorSearch(
  view: WorkspaceSurface,
  extra: { version?: string; file?: string } = {},
): EditorSearch {
  return {
    view,
    ...(extra.version !== undefined && { version: extra.version }),
    ...(extra.file !== undefined && { file: extra.file }),
  }
}

interface EditorLocation {
  pathname: string
  search: unknown
}

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function surfaceOf(location: EditorLocation): WorkspaceSurface {
  const search = location.search
  return parseSurface(
    typeof search === 'object' && search !== null ? (search as { view?: unknown }).view : undefined,
  )
}

/**
 * The surface a blocked navigation switches to, when it stays in this
 * editor and only changes the view — otherwise null.
 *
 * Switching surface and leaving the workflow are different events to the
 * person doing them: one stays with the same work and the other walks away
 * from it. Only the destination tells them apart, so the dialog has to ask
 * before it can word itself correctly.
 */
export function surfaceSwitchTarget(args: {
  current: EditorLocation
  next: EditorLocation
}): WorkspaceSurface | null {
  const { current, next } = args
  if (withoutTrailingSlash(current.pathname) !== withoutTrailingSlash(next.pathname)) return null
  const to = surfaceOf(next)
  return to === surfaceOf(current) ? null : to
}

export interface UnsavedDialogCopy {
  title: string
  description: string
  /** The primary action. */
  confirmLabel: string
  /** Going anyway, offered only when saving is also on the table. */
  secondaryLabel?: string
  variant: 'warning' | 'default'
}

/**
 * What to say about unsaved work that stands in the way of navigation.
 *
 * A surface switch is not a departure — the person is staying with the same
 * workflow — so it gets its own wording and, where possible, an offer to
 * save first. But the work really is discarded either way: both surfaces
 * tear down their unsaved state when they unmount, so a switch without
 * saving loses the drafts exactly as leaving does. Every branch here has to
 * say so; an earlier version said only that the changes "will not appear"
 * on the other side, which read as if they were still safely somewhere.
 */
export function unsavedDialogCopy(args: {
  /** The surface being switched to, or null when leaving the workspace. */
  to: WorkspaceSurface | null
  /** What is unsaved, as a sentence — each surface says it in its own terms. */
  unsaved: string
  /** Saving is possible from here at all (an older version is read-only). */
  canSave: boolean
}): UnsavedDialogCopy {
  const { to, unsaved, canSave } = args

  if (to === null) {
    return {
      title: 'Unsaved changes',
      description: `${unsaved} They’ll be lost if you leave.`,
      confirmLabel: 'Leave',
      variant: 'warning',
    }
  }

  const label = SURFACE_LABELS[to]

  // Nothing to offer but going without them: an older version cannot be
  // saved over, so the only choice left is whether to go.
  if (!canSave) {
    return {
      title: `Open ${label} anyway?`,
      description: `${unsaved} They’ll be lost. ${label} opens the last saved version.`,
      confirmLabel: `Open ${label}`,
      variant: 'warning',
    }
  }

  return {
    title: `Save before opening ${label}?`,
    description: `${unsaved} ${label} opens the last saved version, so switching without saving discards them.`,
    confirmLabel: 'Save and switch',
    secondaryLabel: 'Switch without saving',
    // The primary action keeps the work, so the dialog is not a warning —
    // the discard sits in the secondary slot and says what it does.
    variant: 'default',
  }
}
