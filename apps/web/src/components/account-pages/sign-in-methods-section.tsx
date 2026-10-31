import { AtSign } from 'lucide-react'
import { ONLY_WAY_IN, canDisconnect } from '@awaitstep/ir'
import {
  linkErrorMessage,
  useConnectProvider,
  useDisconnectProvider,
  useSignInMethods,
} from '../../data/dashboard/account'
import { accountPath } from '../../lib/dashboard-paths'
import type { SignInMethod, SignInMethods, SignInProvider } from '../../types/dashboard/account'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ListCard, ListRow } from '../ui/list-card'
import { ShellLink } from '../ui/shell-link'
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

/**
 * Sign-in methods (`AccountSessions`): GitHub and Google connect or
 * disconnect; the email link is always on when the instance sends them.
 */
export function SignInMethodsSection({ org, linkError }: { org: string; linkError?: string }) {
  const methods = useSignInMethods()
  return (
    <section className="settings-width flex flex-col gap-3">
      <SectionHeader
        title="Sign-in methods"
        direction="column"
        caption="Any of these opens the same account"
      />
      <LoadedQuery query={methods} what="sign-in methods">
        {(data) => (
          <>
            {linkError && (
              <p role="alert" className="text-sm text-status-error">
                {linkErrorMessage(linkError, data.email)}
              </p>
            )}
            <ListCard label="Sign-in methods">
              {data.methods.map((method) => (
                <MethodRow key={method.provider} method={method} all={data} org={org} />
              ))}
            </ListCard>
            <p className="text-2xs text-muted-foreground">
              Google and GitHub connect only with an account that uses {data.email}. Only the
              providers your AwaitStep admin turned on are listed.
            </p>
          </>
        )}
      </LoadedQuery>
    </section>
  )
}

interface MethodRowProps {
  method: SignInMethod
  all: SignInMethods
  org: string
}

function MethodRow({ method, all, org }: MethodRowProps) {
  const label = PROVIDER_LABEL[method.provider]
  return (
    <ListRow
      leading={<Tile>{ICONS[method.provider]}</Tile>}
      title={label}
      description={methodDetail(method, all.email)}
      trailing={
        method.provider === 'email' ? (
          <span className="text-2xs text-muted-foreground">Always on</span>
        ) : method.connected ? (
          <DisconnectButton
            method={{ ...method, provider: method.provider }}
            label={label}
            allowed={canDisconnect(all.methods, method.provider, all.providers)}
            org={org}
          />
        ) : (
          <ConnectButton provider={method.provider} label={label} />
        )
      }
    />
  )
}

function ConnectButton({ provider, label }: { provider: SignInProvider; label: string }) {
  const connect = useConnectProvider()

  function handleClick() {
    connect.mutate(provider)
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        aria-label={`Connect ${label}`}
        onClick={handleClick}
        disabled={connect.isPending}
      >
        Connect
      </Button>
      {connect.error && (
        <span role="alert" className="text-2xs text-status-error">
          {connect.error.message}
        </span>
      )}
    </>
  )
}

interface DisconnectButtonProps {
  method: SignInMethod & { provider: SignInProvider }
  label: string
  /** False for the last way in that works when there is no email link. */
  allowed: boolean
  org: string
}

function DisconnectButton({ method, label, allowed, org }: DisconnectButtonProps) {
  const disconnect = useDisconnectProvider()

  function handleClick() {
    disconnect.mutate(method)
  }

  return (
    <>
      <Badge variant="success">Connected</Badge>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Disconnect ${label}`}
        onClick={handleClick}
        disabled={!allowed || disconnect.isPending}
        title={allowed ? undefined : ONLY_WAY_IN}
      >
        Disconnect
      </Button>
      {!allowed && (
        <span className="max-w-[220px] text-right text-2xs text-muted-foreground">
          {ONLY_WAY_IN}{' '}
          <ShellLink
            href={accountPath(org, 'profile')}
            className="text-status-success hover:underline"
          >
            Your data
          </ShellLink>
        </span>
      )}
      {disconnect.error && (
        <span role="alert" className="text-2xs text-status-error">
          {disconnect.error.message}
        </span>
      )}
    </>
  )
}
