import { useState, type ChangeEvent, type SubmitEvent } from 'react'
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
export function CloudflareConnect({ formId, slugs, errorOn, onSubmit, onEdit }: ConnectStepProps) {
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
            href={oauthStartUrl(slugs.org, { project: slugs.project })}
          >
            <CloudflareLogo className="mr-2" fill1="#FFF" fill2="#fff" />
            Setup with Cloudflare.com
          </a>
          <OrDivider />
        </>
      )}
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
          hint={
            <>
              Needs Workers Scripts · Edit, Workers KV · Edit and Account Settings · Read.{' '}
              <a
                href={CLOUDFLARE_TOKENS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-status-success hover:underline"
              >
                Open Cloudflare API tokens ↗
              </a>
            </>
          }
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

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
      <Separator className="flex-1" />
      or
      <Separator className="flex-1" />
    </div>
  )
}
