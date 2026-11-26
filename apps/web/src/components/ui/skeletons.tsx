import type { CSSProperties, ReactNode } from 'react'
import { LIST_ROW_TEXT_CLASS, listRowClass, listRowTrailingClass } from './list-card'

export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={`animate-pulse rounded bg-muted/40 motion-reduce:animate-none ${className ?? ''}`}
    />
  )
}

export function ListRowSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          {/* Line boxes match the real rows: text-sm (20px) title, text-xs (18px) meta. */}
          <div className="flex h-5 items-center gap-2.5">
            <Bone className="h-3.5 w-32" />
            <Bone className="h-3.5 w-16 bg-muted/25" />
          </div>
          <div className="mt-0.5 flex h-4.5 items-center">
            <Bone className="h-3 w-48 bg-muted/20" />
          </div>
        </div>
        <Bone className="h-3 w-12 bg-muted/25" />
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6 pt-2">
      <div className="space-y-3">
        <Bone className="h-5 w-48" />
        <Bone className="h-3 w-72 bg-muted/25" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Bone className="h-3 w-20 bg-muted/25" />
          <Bone className="h-4 w-36" />
        </div>
        <div className="space-y-2">
          <Bone className="h-3 w-24 bg-muted/25" />
          <Bone className="h-4 w-28" />
        </div>
      </div>
      <Bone className="h-px w-full bg-border" />
      <div className="space-y-3">
        <Bone className="h-4 w-32" />
        <Bone className="h-20 w-full rounded-lg bg-muted/20" />
      </div>
    </div>
  )
}

interface LoadingRegionProps {
  /** Read out instead of the placeholders, e.g. "Loading workflows". */
  label: string
  children: ReactNode
}

/** Wraps placeholders so screen readers hear one "Loading …" instead of empty shapes. */
export function LoadingRegion({ label, children }: LoadingRegionProps) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  )
}

interface ListCardSkeletonProps {
  rows?: number
  /** How many trailing slots each row has (status, history, toggle…). */
  trailing?: number
  tile?: boolean
}

/** Placeholder for a `ListCard`: rows keep `ListRow`'s padding and line boxes so nothing jumps. */
export function ListCardSkeleton({ rows = 4, trailing = 3, tile = true }: ListCardSkeletonProps) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-card">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={listRowClass(tile)}>
          {tile && <Bone className="size-10 rounded" />}
          {/* Line boxes match ListRow: text-sm (20px) title, text-xs (18px) description. */}
          <div className={LIST_ROW_TEXT_CLASS}>
            <div className="flex h-5 items-center">
              <Bone className="h-3.5 w-40" />
            </div>
            <div className="flex h-4.5 items-center">
              <Bone className="h-3 w-64 bg-muted/25" />
            </div>
          </div>
          {trailing > 0 && (
            <div className={listRowTrailingClass(tile)}>
              {Array.from({ length: trailing }, (_, slot) => (
                <Bone key={slot} className="h-6 w-[120px] bg-muted/25" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Placeholder for a `SegmentedFilter`'s pills. */
export function FilterSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }, (_, pill) => (
        <Bone key={pill} className="h-[30px] w-[76px] rounded-lg" />
      ))}
    </div>
  )
}
