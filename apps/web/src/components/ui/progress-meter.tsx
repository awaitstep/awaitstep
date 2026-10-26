interface ProgressMeterProps {
  done: number
  total: number
  /** Names the bar, e.g. "Set up Billing". */
  label: string
}

/** "1 of 3 done" with a bar, for setup checklists on a new org or project. */
export function ProgressMeter({ done, total, label }: ProgressMeterProps) {
  const text = `${done} of ${total} done`
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <span className="flex items-center gap-2.5 text-2xs text-muted-foreground">
      <span aria-hidden="true">{text}</span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={text}
        className="h-1.5 w-[120px] overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
    </span>
  )
}
