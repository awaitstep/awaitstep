import type { ApiWorkflowLibraryUpdate } from '../../../lib/dashboard-api'
import { cn } from '../../../lib/utils'
import { ShellLink } from '../../ui/shell-link'

interface LibraryUpdatesProps {
  updates: ApiWorkflowLibraryUpdate[]
  /** Where Redeploy goes for that account; none for someone who can't deploy, or where a deploy is refused. */
  redeployHref?: (accountId: string) => string | undefined
}

/**
 * The band's last row (28r–28t): each Library item an account runs behind
 * its latest published version, one line per item and account. A deploy
 * always bundles the latest, so the way to pick it up is a redeploy.
 */
export function LibraryUpdates({ updates, redeployHref }: LibraryUpdatesProps) {
  if (updates.length === 0) return null
  return (
    <ul
      aria-label="Script and node updates"
      className="divide-y divide-border border-t border-border bg-muted/20"
    >
      {updates.map((update) => {
        const href = redeployHref?.(update.accountId)
        return (
          <li
            key={`${update.itemId}:${update.accountId}`}
            className="flex flex-wrap items-center gap-2.5 px-5 py-3"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[22px] shrink-0 items-center justify-center rounded-md font-mono text-2xs font-semibold',
                update.kind === 'module'
                  ? 'bg-status-warning/15 text-status-warning'
                  : 'bg-node-custom/15 text-node-custom',
              )}
            >
              {update.kind === 'module' ? '{}' : '<>'}
            </span>
            <span className="min-w-[220px] flex-1 text-sm text-foreground/80">
              {update.name} {update.latest} is published. {update.accountName} runs {update.runs}.
            </span>
            {href && (
              <ShellLink href={href} className="shrink-0 text-xs font-medium text-primary">
                Redeploy
              </ShellLink>
            )}
          </li>
        )
      })}
    </ul>
  )
}
