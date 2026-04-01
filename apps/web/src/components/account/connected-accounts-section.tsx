import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { authClient } from '../../lib/auth-client'
import { getOrigin } from '../../lib/utils'
import { GoogleIcon, GitHubIcon } from '../icons/provider-icons'

const PROVIDERS = [
  { id: 'google', name: 'Google', icon: GoogleIcon },
  { id: 'github', name: 'GitHub', icon: GitHubIcon },
]

interface Props {
  enabledProviders: { github: boolean; google: boolean }
}

export function ConnectedAccountsSection({ enabledProviders }: Props) {
  const providers = PROVIDERS.filter((p) => enabledProviders[p.id as keyof typeof enabledProviders])
  const appURL = getOrigin()

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: async () => {
      const res = await authClient.listAccounts()
      if (res.error) throw new Error(res.error.message)
      return res.data ?? []
    },
  })

  const linkMutation = useMutation({
    mutationFn: async (provider: string) => {
      await authClient.linkSocial({
        provider: provider as 'google' | 'github',
        callbackURL: `${appURL}/account`,
      })
    },
  })

  const queryClient = useQueryClient()
  const unlinkMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await authClient.unlinkAccount({ providerId })
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] })
    },
  })

  const linkedProviders = new Set(accounts?.map((a) => a.providerId) ?? [])

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Connected Accounts
      </h2>

      {isLoading ? (
        <div className="mt-3 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {providers.map((provider) => {
            const isLinked = linkedProviders.has(provider.id)
            const account = accounts?.find((a) => a.providerId === provider.id)
            const Icon = provider.icon
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <Icon />
                  <span className="text-sm">{provider.name}</span>
                  {isLinked && (
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Connected
                    </span>
                  )}
                </div>
                {isLinked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={unlinkMutation.isPending}
                    onClick={() => account && unlinkMutation.mutate(account.providerId)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={linkMutation.isPending}
                    onClick={() => linkMutation.mutate(provider.id)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
