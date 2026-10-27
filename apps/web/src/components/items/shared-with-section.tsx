import { itemPath } from '../../lib/dashboard-paths'
import type { SharedItem } from '../../types/dashboard/items'
import { SectionHeader } from '../ui/section-header'
import { SharedItemCard } from './parts/shared-item-card'

interface SharedWithSectionProps {
  /** The org slug, for the cards' links. */
  org: string
  workspaceName: string
  projectName: string
  items: SharedItem[]
}

/** "Shared with Sales": what the project's other workspaces share, read-only here. */
export function SharedWithSection({
  org,
  workspaceName,
  projectName,
  items,
}: SharedWithSectionProps) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeader
        title={`Shared with ${workspaceName}`}
        caption={`From other workspaces in ${projectName} · read-only here · call them from a Call Workflow step`}
      />
      <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 [&>a]:min-w-0 [&>a]:flex-1">
            <SharedItemCard item={item} href={itemPath(org, item)} />
          </li>
        ))}
      </ul>
    </section>
  )
}
