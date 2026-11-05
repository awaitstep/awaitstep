import { ArrowLeft, Workflow } from 'lucide-react'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { PageBody } from '../shell/page-intro'

interface ItemPlaceholderProps {
  slugs: WorkspaceSlugs
  itemId: string
}

/**
 * Where a sample workflow or function leads (`?mock=`, `?as=`): the dummy
 * server's items have no backend, so the editor can't open them.
 */
export function ItemPlaceholder({ slugs, itemId }: ItemPlaceholderProps) {
  return (
    <PageBody>
      <section className="flex max-w-xl flex-col gap-4 rounded-2xl border border-border bg-card p-8">
        <Tile tone="info" size="lg">
          <Workflow />
        </Tile>
        <h1 className="text-xl font-semibold text-foreground">This is sample data</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sample items don’t open in the editor. Real ones do.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Item</dt>
          <dd className="font-mono text-foreground">{itemId}</dd>
        </dl>
        <ShellLink
          href={workspacePath(slugs)}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit' })}
        >
          <ArrowLeft aria-hidden="true" />
          Back to the workspace
        </ShellLink>
      </section>
    </PageBody>
  )
}
