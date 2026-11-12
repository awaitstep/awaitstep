import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import type { TreeNode } from '../../lib/ide/file-tree'
import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { FileIcon } from '../ide/file-icon'

export interface RowMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

interface RowProps {
  label: string
  depth: number
  /** A folder: shows its chevron and toggles. */
  open?: boolean
  active?: boolean
  dirty?: boolean
  muted?: boolean
  title?: string
  icon?: React.ReactNode
  menu?: RowMenuItem[]
  onClick: () => void
}

/** One explorer line: a folder or a file, with its `…` menu (28f). */
export function ExplorerLine({
  label,
  depth,
  open,
  active,
  dirty,
  muted,
  title,
  icon,
  menu,
  onClick,
}: RowProps) {
  const folder = open !== undefined
  return (
    <div
      className={cn(
        'group flex h-7 items-center gap-1 pr-1 text-xs',
        active ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-muted/60',
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-expanded={folder ? open : undefined}
        aria-current={active ? 'true' : undefined}
        className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-left', muted && 'opacity-70')}
      >
        {folder ? (
          open ? (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {icon}
        <span className="truncate">{label}</span>
        {dirty && (
          <span
            aria-label="unsaved"
            className="ml-1 size-1.5 shrink-0 rounded-full bg-status-warning"
          />
        )}
      </button>
      {menu && menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${label}`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {menu.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onSelect={item.onSelect}
                className={item.danger ? 'text-status-error' : undefined}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function fileIconOf(node: TreeNode) {
  return node.kind === 'file' ? <FileIcon role="module" /> : null
}
