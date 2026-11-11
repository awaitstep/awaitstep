import { ChevronRight } from 'lucide-react'
import type { NewAccountProvider } from './providers'

interface ProviderPickerProps {
  providers: NewAccountProvider[]
  onPick: (id: string) => void
}

/** "Connect a new account", step one: which provider the account is on. */
export function ProviderPicker({ providers, onPick }: ProviderPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Add an account from</span>
      <ul className="flex flex-col gap-2">
        {providers.map((provider) => (
          <li key={provider.id}>
            <ProviderRow provider={provider} onPick={onPick} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProviderRow({
  provider,
  onPick,
}: {
  provider: NewAccountProvider
  onPick: (id: string) => void
}) {
  const Icon = provider.icon

  function handlePick() {
    onPick(provider.id)
  }

  return (
    <button
      type="button"
      onClick={handlePick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {Icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white">
          <Icon className="size-7" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{provider.name}</span>
        <span className="text-xs text-muted-foreground">{provider.description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
