import type { ReactNode } from 'react'
import Logo from '../../icons/logo'
import { dashboardPath } from '../../../lib/dashboard-paths'
import { Avatar } from '../../ui/avatar'
import { ShellLink } from '../../ui/shell-link'

const DOCS_URL = 'https://docs.awaitstep.dev'

interface EntryFrameProps {
  /** You, top right; `href` is Your account, null with no org to show it in (D-DB-5). */
  account: { name: string; email: string; image: string | null; href: string | null } | null
  onSignOut: () => void
  children: ReactNode
}

/**
 * /dashboard's own frame (17a): AwaitStep, Docs and you along the top, no
 * org rail, the page centred as drawn, Docs and Sign out at the foot.
 */
export function EntryFrame({ account, onSignOut, children }: EntryFrameProps) {
  const avatar = account && (
    <Avatar name={account.name} email={account.email} src={account.image} className="size-8.5" />
  )

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
        <a
          href={DOCS_URL}
          className="flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Docs
        </a>
        {account?.href ? (
          <ShellLink
            href={account.href}
            aria-label="Your account"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {avatar}
          </ShellLink>
        ) : (
          avatar
        )}
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
