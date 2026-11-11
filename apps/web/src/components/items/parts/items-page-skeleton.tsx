import { Bone, FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../../ui/skeletons'

interface ItemsPageSkeletonProps {
  /** The loading region's name, e.g. "Loading workflows". */
  label: string
}

/** A workspace list while it loads: filters, rows, then the shared-with cards. */
export function ItemsPageSkeleton({ label }: ItemsPageSkeletonProps) {
  return (
    <LoadingRegion label={label}>
      <div className="flex justify-end">
        <FilterSkeleton />
      </div>
      <ListCardSkeleton />
      <div className="flex flex-col gap-3.5">
        <Bone className="h-5 w-48" />
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Bone className="h-[78px] rounded-2xl" />
          <Bone className="h-[78px] rounded-2xl" />
        </div>
      </div>
    </LoadingRegion>
  )
}
