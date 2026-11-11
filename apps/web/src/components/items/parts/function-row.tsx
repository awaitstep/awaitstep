import { Code } from 'lucide-react'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { ItemRow } from './item-row'
import { RunActivity } from './run-activity'

interface FunctionRowProps {
  item: WorkspaceItem
  href: string
  /** Names the share switch: "Shared with Project 101: CRM sync". */
  projectName: string
  onShareChange: (shared: boolean) => void
}

/** One function on a workspace's Functions list, in the same row as a workflow. */
export function FunctionRow({ item, href, projectName, onShareChange }: FunctionRowProps) {
  return (
    <ItemRow
      item={item}
      href={href}
      icon={<Code />}
      description={item.description}
      projectName={projectName}
      onShareChange={onShareChange}
      activity={<RunActivity item={item} />}
    />
  )
}
