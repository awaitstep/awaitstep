import { Lock, Plug } from 'lucide-react'
import { Button } from '../../ui/button'

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

interface ConnectionsEmptyProps {
  orgName: string
  projectName: string
  /** Org accounts this project could add; null while unknown. */
  availableCount: number | null
  /** Without them the viewer can't add accounts: the ways in are hidden. */
  onUseOrgAccount?: () => void
  onConnectNew?: () => void
}

/** The accounts card before anything is connected (`ProjectConnectionsEmpty`, 23c). */
export function ConnectionsEmpty({
  orgName,
  projectName,
  availableCount,
  onUseOrgAccount,
  onConnectNew,
}: ConnectionsEmptyProps) {
  const already =
    availableCount && availableCount > 0
      ? ` ${orgName} already has ${NUMBER_WORDS[availableCount] ?? availableCount} you can use.`
      : ''
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-12 pt-[52px] text-center">
      <span className="flex size-[42px] items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        <Plug className="size-[19px]" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-foreground">No account connected yet</span>
      <p className="max-w-[460px] text-xs leading-relaxed text-muted-foreground">
        Workflows in {projectName} can be built and tested, but{' '}
        <b className="font-semibold text-foreground">Deploy stays disabled</b> until this project
        can reach a Cloudflare account.{already}
      </p>
      {(onUseOrgAccount || onConnectNew) && (
        <span className="mt-1 flex flex-wrap justify-center gap-2">
          {onUseOrgAccount && (
            <Button type="button" size="sm" onClick={onUseOrgAccount}>
              Use an account in {orgName}
            </Button>
          )}
          {onConnectNew && (
            <Button type="button" variant="outline" size="sm" onClick={onConnectNew}>
              Connect a new account
            </Button>
          )}
        </span>
      )}
      <p className="max-w-[460px] text-xs leading-relaxed text-muted-foreground">
        A new account needs its Cloudflare account ID and an API token. One you connect here belongs
        to {projectName} alone.
      </p>
    </div>
  )
}

/** *What needs an org admin* (23c). Request an account comes in a later step (D-PC-7). */
export function OrgAdminNote({ projectName }: { projectName: string }) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-status-warning/30 bg-card px-5 py-[18px]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-status-warning">
        <Lock className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-[260px] flex-1 flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">What needs an org admin</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A project admin can connect an account for {projectName} and set its default. An account
          for the whole organization, or one restricted to another project, is an org owner’s or
          admin’s call, on the organization’s Connections page.
        </p>
      </span>
    </section>
  )
}
