import { Button } from '../ui/button'
import { timeAgo, timeUntil } from '../../lib/time'
import type { ApiKeySummary } from '../../lib/api-client'

export function ApiKeyRow({
  apiKey,
  badge,
  onRevoke,
}: {
  apiKey: ApiKeySummary
  /** The key's level, shown next to its name: "Org" or the project's name. */
  badge?: string
  onRevoke: (id: string) => void
}) {
  const scopes: string[] = JSON.parse(apiKey.scopes)
  const expired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false

  function handleRevoke() {
    onRevoke(apiKey.id)
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{apiKey.name}</span>
          {badge && (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {badge}
            </span>
          )}
          <code className="rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
            {apiKey.keyPrefix}...
          </code>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {scopes.map((s) => (
            <span
              key={s}
              className="rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {s}
            </span>
          ))}
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground/60">
            {apiKey.lastUsedAt ? `Used ${timeAgo(apiKey.lastUsedAt)}` : 'Never used'}
          </span>
          {apiKey.expiresAt && (
            <>
              <span className="text-xs text-muted-foreground/60">·</span>
              <span
                className={`text-xs ${expired ? 'text-status-error' : 'text-muted-foreground/60'}`}
              >
                {expired ? 'Expired' : `Expires in ${timeUntil(apiKey.expiresAt)}`}
              </span>
            </>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRevoke}>
        Revoke
      </Button>
    </div>
  )
}
