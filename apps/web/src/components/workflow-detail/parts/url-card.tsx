import { OverviewCard } from '../../workspaces/parts/overview-card'
import { CopyUrl } from './copy-url'

interface UrlCardProps {
  /** The live worker's URL; none while nothing is published. */
  url: string | null | undefined
}

/**
 * A function's URL (`FunctionDetail`): a function is called by POSTing to its
 * worker, so its page offers the URL once something is live.
 */
export function UrlCard({ url }: UrlCardProps) {
  if (!url) return null
  return (
    <OverviewCard title="URL">
      <div className="flex flex-col gap-2.5 px-5 py-4">
        <CopyUrl url={url} />
        <p className="text-xs text-muted-foreground">POST to call it.</p>
      </div>
    </OverviewCard>
  )
}
