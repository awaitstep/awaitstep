import type { ReactNode } from 'react'
import { TabsList, TabsTrigger } from './tabs'

/** The boards' pill tablist (`Access`, `OrgResources`), on the kit's tabs. */
export function PillTabsList({ children }: { children: ReactNode }) {
  return (
    <TabsList className="w-fit gap-1 rounded-xl border border-border bg-card p-1">
      {children}
    </TabsList>
  )
}

interface PillTabProps {
  value: string
  /** Shown beside the label once known; the open tab tints it. */
  count?: number
  children: ReactNode
}

export function PillTab({ value, count, children }: PillTabProps) {
  return (
    <TabsTrigger
      value={value}
      className="group h-[34px] rounded-lg border-0 px-3.5 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-sm"
    >
      {children}
      {count !== undefined && (
        <>
          {/* Reads as "Members 4", not "Members4". */}{' '}
          <span className="rounded-full bg-muted px-1.5 text-3xs text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-status-success">
            {count}
          </span>
        </>
      )}
    </TabsTrigger>
  )
}
