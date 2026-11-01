import { Building2, Plus } from 'lucide-react'
import { dashboardPath, withNewDialog } from '../../../lib/dashboard-paths'
import { Button } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'

/** 17b: signed in, in no organization yet. */
export function NoOrgState({ email }: { email: string }) {
  return (
    <section className="flex flex-col items-center gap-3.5 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <Tile tone="ok" size="lg">
        <Building2 />
      </Tile>
      <h2 className="text-lg font-semibold text-foreground">You’re not in an organization yet</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Create one to start building, or ask a teammate to invite {email}. Invites you get appear
        here.
      </p>
      <Button asChild size="lg">
        <ShellLink href={withNewDialog(dashboardPath(), 'org')}>
          <Plus aria-hidden="true" />
          Create an organization
        </ShellLink>
      </Button>
    </section>
  )
}
