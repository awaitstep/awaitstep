import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Github } from 'lucide-react'
import { Button } from '../ui/button'
import { authClient } from '../../lib/auth-client'

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    ),
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: () => <Github className="h-4 w-4" />,
  },
]

export function ConnectedAccountsSection() {
  const appURL = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000'

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
          {PROVIDERS.map((provider) => {
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
