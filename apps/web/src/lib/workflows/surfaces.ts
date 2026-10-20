/** The two ways to edit a workflow. Peers, not a page and a side trip. */
export const WORKSPACE_SURFACES = ['canvas', 'code'] as const
export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number]

const SURFACE_LABELS: Readonly<Record<WorkspaceSurface, string>> = {
  canvas: 'Canvas',
  code: 'Code',
}

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function otherSurface(surface: WorkspaceSurface): WorkspaceSurface {
  return surface === 'canvas' ? 'code' : 'canvas'
}

/**
 * The other surface of this same workflow, when that is where a blocked
 * navigation is heading — otherwise null.
 *
 * Switching surface and leaving the workflow are different events to the
 * person doing them: one stays with the same work and the other walks away
 * from it. Only the destination tells them apart, so the dialog has to ask
 * before it can word itself correctly.
 */
export function surfaceSwitchTarget(args: {
  from: WorkspaceSurface
  workflowId: string
  nextPathname: string
}): WorkspaceSurface | null {
  const to = otherSurface(args.from)
  const target = `/workflows/${args.workflowId}/${to}`
  return withoutTrailingSlash(args.nextPathname) === target ? to : null
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
      description: `${unsaved} They will be lost if you leave.`,
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
      description: `${unsaved} They will be lost — ${label} opens the last saved version.`,
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
