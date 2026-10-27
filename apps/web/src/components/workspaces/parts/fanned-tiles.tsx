import { Code, Plus, Workflow } from 'lucide-react'

/** The three fanned tiles above "Nothing in Support yet" (`EmptyWorkspace`). Decorative. */
export function FannedTiles() {
  return (
    <span aria-hidden="true" className="flex items-center">
      <span className="flex size-12 -rotate-[8deg] items-center justify-center rounded-[13px] border border-border bg-muted text-muted-foreground [&_svg]:size-5">
        <Workflow />
      </span>
      <span className="relative -mx-1.5 flex size-15 items-center justify-center rounded-2xl border border-status-success/40 bg-tone-ok text-status-success [&_svg]:size-6">
        <Plus />
      </span>
      <span className="flex size-12 rotate-[8deg] items-center justify-center rounded-[13px] border border-border bg-muted text-muted-foreground [&_svg]:size-5">
        <Code />
      </span>
    </span>
  )
}
