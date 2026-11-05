export const OLD_VERSION_REASON = 'Open the latest version to make changes'
const LOADING_ACCESS_REASON = 'Checking your access…'

/**
 * Why a workflow can't be edited (canvas or code), in the words of the state it is really in:
 * the role that forbids it, the old version on screen, or access still
 * loading. One shared sentence told a Viewer on an old version to "open the
 * latest" as if they could edit it there.
 */
export function readOnlyReason(args: { viewOnlyReason?: string; olderVersion?: boolean }): string {
  if (args.viewOnlyReason) return args.viewOnlyReason
  if (args.olderVersion) return OLD_VERSION_REASON
  return LOADING_ACCESS_REASON
}
