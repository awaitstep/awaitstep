import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Server, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'
import { useOrgReady } from '../../stores/org-store'

export function SelfHostedBanner() {
  const ready = useOrgReady()
  const queryClient = useQueryClient()

  const { data: selfHosted } = useQuery({
    queryKey: ['self-hosted-connection'],
    queryFn: () => api.getSelfHostedConnection(),
    enabled: ready,
    retry: false,
  })

  const registerMutation = useMutation({
    mutationFn: () => api.registerSelfHostedConnection(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['self-hosted-connection'] })
    },
  })

  return (
    <>
      {selfHosted?.configured && !selfHosted.registered && (
        <div className="mt-6 rounded-md border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Self-hosted connection detected</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your server has a Cloudflare connection configured via environment variables ({selfHosted.name} &middot; {selfHosted.accountId}).
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5"
                disabled={registerMutation.isPending}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Register Connection
              </Button>
            </div>
          </div>
        </div>
      )}

      {selfHosted?.configured && selfHosted.registered && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/[0.04] px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-status-success" />
          <span className="text-xs text-status-success/80">Self-hosted connection active ({selfHosted.name})</span>
        </div>
      )}

      {/* Self-hosting instructions */}
      <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Self-hosting?</p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/60">
          Add these variables to your <code className="rounded bg-muted/60 px-1 py-0.5 text-muted-foreground">.env</code> file
          to auto-register a connection for all users:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_CONNECTION_NAME=Production  # optional`}
        </pre>
      </div>
    </>
  )
}
