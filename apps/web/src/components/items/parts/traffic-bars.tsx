const MAX_PX = 22
const MIN_PX = 2

interface TrafficBarsProps {
  /** Requests per 2-hour bucket, oldest first. */
  buckets: number[]
}

/** A function's requests over the last 24 hours, as the `WsFunctions` board draws them. */
export function TrafficBars({ buckets }: TrafficBarsProps) {
  const peak = Math.max(1, ...buckets)
  const total = buckets.reduce((sum, n) => sum + n, 0)
  return (
    <span
      role="img"
      aria-label={`Requests over the last 24 hours: ${total.toLocaleString('en-US')}`}
      className="flex h-[22px] w-[120px] items-end gap-0.5"
    >
      {buckets.map((count, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px] bg-status-info"
          style={{ height: Math.max(MIN_PX, Math.round((count / peak) * MAX_PX)) }}
        />
      ))}
    </span>
  )
}
