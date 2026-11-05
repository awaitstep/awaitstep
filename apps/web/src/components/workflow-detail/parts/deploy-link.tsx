import { Button, buttonVariants } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'

interface DeployLinkProps {
  href: string
  label: string
  /** Why it can't go out now; a disabled button saying so instead of a link. */
  blockedReason?: string
}

/** Deploy or Roll back on one version: a link to Deploy set to it, or, while it can't go out, why not. */
export function DeployLink({ href, label, blockedReason }: DeployLinkProps) {
  if (blockedReason) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        disabled
        title={blockedReason}
      >
        {label}
      </Button>
    )
  }
  return (
    <ShellLink
      href={href}
      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7' })}
    >
      {label}
    </ShellLink>
  )
}

/** Why a version can't be deployed (a function's, published): it, or the one live, is locked. */
export function deployBlockedReason(
  versionLocked: boolean,
  liveLocked: boolean,
  isFunction = false,
): string | undefined {
  if (versionLocked) return 'This version is locked'
  if (liveLocked) return `The ${isFunction ? 'published' : 'deployed'} version is locked`
  return undefined
}
