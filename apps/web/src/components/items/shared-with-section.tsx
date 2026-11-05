import { itemPath, type ProjectSlugs } from '../../lib/dashboard-paths'
import type { SharedItem } from '../../types/dashboard/items'
import { SectionHeader } from '../ui/section-header'
import { SharedItemCard } from './parts/shared-item-card'

interface SharedWithSectionProps {
  /** The project the items are shared in, for the cards' links into their own workspaces. */
  slugs: ProjectSlugs
  workspaceName: string
  items: SharedItem[]
}

/** A shared item opens in the workspace that shared it, when the viewer can open that one. */
function sharedItemHref(slugs: ProjectSlugs, item: SharedItem): string | null {
  return item.canOpen ? itemPath({ ...slugs, workspace: item.from.slug }, item) : null
}

/** "Shared with Sales": what the project's other workspaces share, read-only here. */
export function SharedWithSection({ slugs, workspaceName, items }: SharedWithSectionProps) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeader
        title={`Shared with ${workspaceName}`}
        caption="Shared by other workspaces. Read-only here; call them with a Call Workflow step."
      />
      <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 [&>*]:min-w-0 [&>*]:flex-1">
            <SharedItemCard item={item} href={sharedItemHref(slugs, item)} />
          </li>
        ))}
      </ul>
    </section>
  )
}
