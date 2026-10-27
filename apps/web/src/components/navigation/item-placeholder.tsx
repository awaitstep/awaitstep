import { ArrowLeft, Workflow } from 'lucide-react'
import { orgPath } from '../../lib/dashboard-paths'
import { buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { PageBody } from '../shell/page-intro'

interface ItemPlaceholderProps {
  org: string
  itemId: string
  runId?: string
  kind: 'workflow' | 'function'
}

/**
 * Where a workflow, function or run row leads while every item is sample
 * data (W1). The editor and run pages work on real workflows, so this says
 * so instead of opening them on an id they don't know. B1 replaces it.
 */
export function ItemPlaceholder({ org, itemId, runId, kind }: ItemPlaceholderProps) {
  const what = runId ? 'run' : kind
  const opens = runId ? 'runs open their run page' : `${kind}s open in the editor`
  return (
    <PageBody>
      <section className="flex max-w-xl flex-col gap-4 rounded-2xl border border-border bg-card p-8">
        <Tile tone="info" size="lg">
          <Workflow />
        </Tile>
        <h1 className="text-xl font-semibold text-foreground">This {what} is sample data</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The new dashboard runs on sample data until workspaces have a backend. Real {opens} from
          here once it lands.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Item</dt>
          <dd className="font-mono text-foreground">{itemId}</dd>
          {runId && (
            <>
              <dt className="text-muted-foreground">Run</dt>
              <dd className="font-mono text-foreground">{runId}</dd>
            </>
          )}
        </dl>
        <ShellLink
          href={orgPath(org)}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit' })}
        >
          <ArrowLeft aria-hidden="true" />
          Back to projects
        </ShellLink>
      </section>
    </PageBody>
  )
}
