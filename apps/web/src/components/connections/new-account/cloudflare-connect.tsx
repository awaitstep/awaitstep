import { useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Check } from 'lucide-react'
import { CLOUDFLARE_PERMISSIONS } from '@awaitstep/provider-cloudflare/oauth-permissions'
import { useOAuthStatus } from '../../../data/dashboard/org-settings'
import { oauthStartUrl } from '../../org-settings/oauth-start'
import { buttonVariants } from '../../ui/button'
import { FormField } from '../../ui/form-field'
import { Input } from '../../ui/input'
import { Separator } from '../../ui/separator'
import { CloudflareLogo } from './cloudflare-logo'
import type { ConnectStepProps } from './providers'
import { cn } from '../../../lib/utils'

const CLOUDFLARE_TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

/**
 * Connecting a Cloudflare account: sign in with Cloudflare when this
 * deployment offers it, or a name, account ID and API token.
 */
export function CloudflareConnect({ formId, place, errorOn, onSubmit, onEdit }: ConnectStepProps) {
  const oauthStatus = useOAuthStatus()
  const oauthEnabled = oauthStatus.data?.enabled === true
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [token, setToken] = useState('')

  function handleName(event: ChangeEvent<HTMLInputElement>) {
    onEdit()
    setName(event.target.value)
  }

  function handleAccountId(event: ChangeEvent<HTMLInputElement>) {
    onEdit()
    setAccountId(event.target.value)
  }

  function handleToken(event: ChangeEvent<HTMLInputElement>) {
    onEdit()
    setToken(event.target.value)
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    onSubmit({ name, accountId, token })
  }

  return (
    <div className="flex flex-col gap-4">
      {oauthEnabled && (
        <>
          <a
            className={cn(
              buttonVariants({
                variant: 'default',
                size: 'lg',
              }),
              'w-full bg-orange-500 hover:bg-orange-600',
            )}
            href={oauthStartUrl(place.org, place.project ? { project: place.project } : {})}
          >
            <CloudflareLogo className="mr-2" fill1="#FFF" fill2="#fff" />
            Setup with Cloudflare.com
          </a>
          {!place.project && (
            <p className="text-xs text-muted-foreground">
              Signing in with Cloudflare connects the account for every project.
            </p>
          )}
          <OrDivider />
        </>
      )}
      <TokenPermissions />
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <FormField label="Name" error={errorOn('name')}>
          <Input value={name} onChange={handleName} placeholder="Checkout staging" />
        </FormField>
        <FormField label="Account ID" error={errorOn('accountId')}>
          <Input
            value={accountId}
            onChange={handleAccountId}
            placeholder="32-character ID from the Cloudflare dashboard"
            className="font-mono"
          />
        </FormField>
        <FormField
          label="API token"
          error={errorOn('token')}
          hint="Encrypted when saved. You won’t see it again."
        >
          <Input
            type="password"
            value={token}
            onChange={handleToken}
            placeholder="Paste the token"
            className="font-mono"
          />
        </FormField>
      </form>
    </div>
  )
}

/** The token's permissions, and where to make one. */
function TokenPermissions() {
  return (
    <section
      aria-label="Token permissions"
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4"
    >
      <span className="text-xs font-semibold text-foreground">
        Create an API token in Cloudflare
      </span>
      <span className="text-2xs text-muted-foreground">
        Give it the permissions signing in with Cloudflare grants:
      </span>
      <ul className="flex flex-col gap-1.5">
        {CLOUDFLARE_PERMISSIONS.map((permission) => (
          <li key={permission.scope} className="flex items-center gap-2 text-xs text-foreground/90">
            <Check className="size-3.5 text-status-success" aria-hidden="true" />
            {permission.label}
          </li>
        ))}
      </ul>
      <a
        href={CLOUDFLARE_TOKENS_URL}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-xs font-medium text-status-success hover:underline"
      >
        Open Cloudflare API tokens ↗
      </a>
    </section>
  )
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
      <Separator className="flex-1" />
      or
      <Separator className="flex-1" />
    </div>
  )
}
