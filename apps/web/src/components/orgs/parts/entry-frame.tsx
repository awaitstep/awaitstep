import type { ReactElement, ReactNode } from 'react'
import Logo from '../../icons/logo'
import { dashboardPath } from '../../../lib/dashboard-paths'
import { Avatar } from '../../ui/avatar'
import { ShellLink } from '../../ui/shell-link'

const DOCS_URL = 'https://docs.awaitstep.dev'

interface EntryFrameProps {
  /** You, top right: your account's menu. */
  account: { name: string; email: string; image: string | null } | null
  /** Wraps the avatar button in your account's menu; without it the avatar is only shown. */
  accountMenu?: (trigger: ReactElement) => ReactNode
  /** The page's own controls in the top bar (a Save button), before Docs. */
  actions?: ReactNode
  onSignOut: () => void
  children: ReactNode
}

function avatarButton(account: NonNullable<EntryFrameProps['account']>): ReactElement {
  return (
    <button
      type="button"
      aria-label="Your account"
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Avatar name={account.name} email={account.email} src={account.image} className="size-8.5" />
    </button>
  )
}

/**
 * /dashboard's own frame (17a): AwaitStep, Docs and you along the top, no
 * org rail, the page centred as drawn, Docs and Sign out at the foot.
 */
export function EntryFrame({
  account,
  accountMenu,
  actions,
  onSignOut,
  children,
}: EntryFrameProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-7">
        <ShellLink
          href={dashboardPath()}
          className="flex items-center gap-2.5 text-sm font-semibold text-foreground"
        >
          <Logo className="h-5 w-auto" />
          AwaitStep
        </ShellLink>
        <span className="flex-1" />
        {actions}
        <a
          href={DOCS_URL}
          className="flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Docs
        </a>
        {account && (accountMenu ? accountMenu(avatarButton(account)) : avatarButton(account))}
      </header>
      <main className="mx-auto flex w-full max-w-[74rem] flex-1 flex-col gap-8 px-4 pb-14 pt-10 sm:px-8">
        {children}
      </main>
      <footer className="flex flex-wrap justify-center gap-4.5 p-4.5 text-2xs text-muted-foreground">
        <a href={DOCS_URL} className="hover:text-foreground">
          Docs
        </a>
        <button type="button" onClick={onSignOut} className="hover:text-foreground">
          Sign out
        </button>
      </footer>
    </div>
  )
}
