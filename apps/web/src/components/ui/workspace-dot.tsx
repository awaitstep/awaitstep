import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Badge } from './badge'
import { WORKSPACE_DOT_CLASS, type WorkspaceColour } from './workspace-colour'

const DOT_SIZE = {
  sm: 'size-2 rounded-[3px]',
  md: 'size-2.5 rounded-[3px]',
  lg: 'size-3.5 rounded-[4px]',
} as const

interface WorkspaceDotProps {
  colour: WorkspaceColour
  size?: keyof typeof DOT_SIZE
}

/** A workspace's colour square. Decorative: its name always sits beside it. */
export function WorkspaceDot({ colour, size = 'sm' }: WorkspaceDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0', DOT_SIZE[size], WORKSPACE_DOT_CLASS[colour])}
    />
  )
}

interface ScopeChipProps {
  colour: WorkspaceColour
  /** "Sales", "Project 101 · Sales", "from IT · v7". */
  children: ReactNode
}

/** A pill naming a workspace, led by its colour square. */
export function ScopeChip({ colour, children }: ScopeChipProps) {
  return (
    <Badge variant="default" className="gap-1.5 px-2.5 py-1 font-normal">
      <WorkspaceDot colour={colour} />
      {children}
    </Badge>
  )
}
