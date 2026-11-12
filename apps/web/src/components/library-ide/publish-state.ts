import type { ApiLibraryCheck } from '../../lib/library-api'

/**
 * The Publish button (D8): it names the version a publish would make, and
 * says why it can't yet — unsaved files, problems, or a check still running.
 */
export function publishState(
  check: ApiLibraryCheck | undefined,
  checking: boolean,
  itemDirty: boolean,
  failed = false,
): { label: string; disabledReason: string | null } {
  if (!check && failed) {
    return { label: 'Publish', disabledReason: 'Couldn’t check it. Save to try again' }
  }
  if (!check) return { label: 'Publish', disabledReason: 'Checking…' }
  const label = check.version ? `Publish v${check.version}` : 'Publish'
  if (itemDirty) return { label, disabledReason: 'Save first' }
  if (check.problems.length > 0) {
    const count = check.problems.length
    return { label, disabledReason: count === 1 ? '1 problem to fix' : `${count} problems to fix` }
  }
  if (!check.version) return { label, disabledReason: 'Nothing to publish' }
  if (checking) return { label, disabledReason: 'Checking…' }
  return { label, disabledReason: null }
}
