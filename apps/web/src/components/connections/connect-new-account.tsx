import { ShellLink } from '../ui/shell-link'
import type { ConnectAccountLink } from './connect-account-link'

interface ConnectNewAccountProps {
  link: ConnectAccountLink
}

/** An account picker's way to an account it doesn't list yet: the page where accounts are connected. */
export function ConnectNewAccount({ link }: ConnectNewAccountProps) {
  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
      {link.kind === 'link' ? (
        <>
          <ShellLink
            href={link.href}
            className="w-fit text-sm font-medium text-primary-ink hover:underline"
          >
            Connect a new account
          </ShellLink>
          <span className="text-2xs text-muted-foreground">On the {link.label} page.</span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          An org owner or admin can connect another on the {link.label} page.
        </span>
      )}
    </div>
  )
}
