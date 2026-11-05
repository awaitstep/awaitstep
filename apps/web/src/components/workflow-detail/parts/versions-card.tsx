import { Lock } from 'lucide-react'
import type { VersionSummary } from '../../../lib/api-client'
import { timeAgo } from '../../../lib/time'
import { Badge } from '../../ui/badge'
import { LoadMoreButton } from '../../ui/load-more-button'
import { ShellLink } from '../../ui/shell-link'
import { OverviewCard } from '../../workspaces/parts/overview-card'
import { plural } from '../../../lib/plural'
import { DeployLink, deployBlockedReason } from './deploy-link'

interface VersionsCardProps {
  /** Where a version opens: the editor at that version. */
  versionHref: (versionId: string) => string
  /** Deploy, set to that version. */
  deployHref: (versionId: string) => string
  versions: VersionSummary[]
  /** The live one: tagged "deployed", with nothing to deploy. */
  deployedVersionId: string | undefined
  /** The deployed version is locked: no other can go out. */
  deployBlocked: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** Never deployed: "1 so far" rather than "1 version in all" (24f). */
  draft?: boolean
}

/** Versions (`WorkflowDetail`): newest first, who saved each, Deploy on the ones not live. */
export function VersionsCard({
  versionHref,
  deployHref,
  versions,
  deployedVersionId,
  deployBlocked,
  hasMore,
  loadingMore,
  onLoadMore,
  draft,
}: VersionsCardProps) {
  let caption = `${plural(versions.length, 'version')} in all`
  if (hasMore) caption = 'Newest first'
  else if (draft) caption = `${versions.length} so far`

  return (
    <OverviewCard title="Versions" caption={caption}>
      {versions.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Nothing saved yet. Open the editor to build it.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {versions.map((v) => {
            const live = v.id === deployedVersionId
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <ShellLink
                  href={versionHref(v.id)}
                  className="font-mono text-sm font-semibold text-foreground hover:underline"
                  title="Open this version"
                >
                  v{v.version}
                </ShellLink>
                {live && <Badge variant="success">deployed</Badge>}
                {v.locked === 1 && (
                  <Badge variant="warning">
                    <Lock aria-hidden="true" className="size-3" />
                    locked
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {v.createdByName ?? ''}
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(v.createdAt)}</span>
                {!live && (
                  <DeployLink
                    href={deployHref(v.id)}
                    label="Deploy"
                    blockedReason={deployBlockedReason(v.locked === 1, deployBlocked)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {hasMore && (
        <div className="px-5 pb-3">
          <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={onLoadMore} />
        </div>
      )}
    </OverviewCard>
  )
}
