import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { authClient } from '../../lib/auth-client'
import { timeAgo } from '../../lib/time'

function parseUserAgent(ua: string): string {
  if (!ua) return 'Unknown browser'
  const browser = /Chrome/.test(ua)
    ? 'Chrome'
    : /Firefox/.test(ua)
      ? 'Firefox'
      : /Safari/.test(ua)
        ? 'Safari'
        : /Edge/.test(ua)
          ? 'Edge'
          : 'Browser'
  const os = /Mac/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Linux/.test(ua)
        ? 'Linux'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : 'Unknown'
  return `${browser} on ${os}`
}

export function SessionsSection({ currentSessionToken }: { currentSessionToken: string }) {
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await authClient.listSessions()
      if (res.error) throw new Error(res.error.message)
      return res.data ?? []
    },
  })

  const queryClient = useQueryClient()
  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await authClient.revokeSession({ token })
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  function handleRevokeOpenChange(open: boolean) {
    if (!open) setRevokeTarget(null)
  }

  function handleConfirmRevoke() {
    if (revokeTarget) {
      revokeMutation.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) })
    }
  }

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Sessions
      </h2>

      {isLoading ? (
        <div className="mt-3 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {sessions?.map((s) => {
            const isCurrent = s.token === currentSessionToken
            const sessionAge = timeAgo(s.createdAt)
            return (
              <div
                key={s.token}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">
                        {parseUserAgent(s.userAgent ?? '')}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress ?? 'Unknown IP'} · {sessionAge}
                    </p>
                  </div>
                </div>
                {!isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRevokeTarget(s.token)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={handleRevokeOpenChange}
        title="Revoke session"
        description="This will sign out the device associated with this session."
        confirmLabel="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={handleConfirmRevoke}
      />
    </section>
  )
}
