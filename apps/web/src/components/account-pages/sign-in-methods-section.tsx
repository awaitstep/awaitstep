import { AtSign } from 'lucide-react'
import { useSetSignInMethod, useSignInMethods } from '../../data/dashboard/account'
import type { SignInMethod, SignInProvider } from '../../types/dashboard/account'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ListCard, ListRow } from '../ui/list-card'
import { SectionHeader } from '../ui/section-header'
import { Tile } from '../ui/tile'
import { GitHubIcon, GoogleIcon } from '../icons/provider-icons'
import { LoadedQuery } from '../workspaces/loaded-query'
import { methodDetail, PROVIDER_LABEL } from './account-format'

const ICONS = {
  github: <GitHubIcon />,
  google: <GoogleIcon />,
  email: <AtSign />,
}

/** Sign-in methods (`AccountSessions`): GitHub and Google connect or disconnect; the email link is always on. */
export function SignInMethodsSection() {
  const methods = useSignInMethods()
  return (
    <section className="settings-width flex flex-col gap-3">
      <SectionHeader title="Sign-in methods" caption="Any of these opens the same account" />
      <LoadedQuery query={methods} what="sign-in methods">
        {(data) => (
          <ListCard label="Sign-in methods">
            {data.map((method) => (
              <MethodRow key={method.provider} method={method} />
            ))}
          </ListCard>
        )}
      </LoadedQuery>
      <p className="text-2xs text-muted-foreground">
        Only the providers your AwaitStep admin turned on are listed.
      </p>
    </section>
  )
}

function MethodRow({ method }: { method: SignInMethod }) {
  const label = PROVIDER_LABEL[method.provider]
  return (
    <ListRow
      leading={<Tile>{ICONS[method.provider]}</Tile>}
      title={label}
      description={methodDetail(method)}
      trailing={
        method.provider === 'email' ? (
          <span className="text-2xs text-muted-foreground">Always on</span>
        ) : (
          <ProviderToggle
            provider={method.provider}
            label={label}
            connected={method.account !== null}
          />
        )
      }
    />
  )
}

interface ProviderToggleProps {
  provider: SignInProvider
  label: string
  connected: boolean
}

function ProviderToggle({ provider, label, connected }: ProviderToggleProps) {
  const set = useSetSignInMethod()

  function handleClick() {
    set.mutate({ provider, connected: !connected })
  }

  return (
    <>
      {connected && <Badge variant="success">Connected</Badge>}
      <Button
        type="button"
        size="sm"
        variant={connected ? 'outline' : 'default'}
        aria-label={`${connected ? 'Disconnect' : 'Connect'} ${label}`}
        onClick={handleClick}
        disabled={set.isPending}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </Button>
      {set.error && (
        <span role="alert" className="text-2xs text-status-error">
          {set.error.message}
        </span>
      )}
    </>
  )
}
