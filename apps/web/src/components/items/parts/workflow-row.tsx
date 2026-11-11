import { Workflow } from 'lucide-react'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { ItemRow } from './item-row'
import { RunActivity } from './run-activity'

interface WorkflowRowProps {
  item: WorkspaceItem
  href: string
  /** Names the share switch: "Shared with Project 101: Lead enrichment". */
  projectName: string
  onShareChange: (shared: boolean) => void
}

/** One workflow on a workspace's Workflows list, as the `Workflows` board draws it. */
export function WorkflowRow({ item, href, projectName, onShareChange }: WorkflowRowProps) {
  return (
    <ItemRow
      item={item}
      href={href}
      icon={<Workflow />}
      description={item.description}
      projectName={projectName}
      onShareChange={onShareChange}
      activity={<RunActivity item={item} />}
    />
  )
}
