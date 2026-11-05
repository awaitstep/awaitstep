import { memo, useLayoutEffect, useRef } from 'react'
import type { SessionLogLine } from '../../stores/test-session-store'
import { cn } from '../../lib/utils'

const NEAR_BOTTOM_PX = 40

/**
 * Worker output, oldest first. Follows the tail only while the reader is
 * already at the bottom — scrolling up to read something is a decision the
 * next log line should not undo.
 *
 * Memoized, and the "at bottom" test is taken from the scroll event rather
 * than measured after a render: by then the new rows are already in the DOM,
 * which makes any batch of more than a line or two look like the reader had
 * scrolled away.
 */
export const OutputPanel = memo(function OutputPanel({ entries }: { entries: SessionLogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  function handleScroll() {
    const container = containerRef.current
    if (!container) return
    followRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX
  }

  useLayoutEffect(() => {
    if (followRef.current) endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
        Output appears here while a test session runs.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto bg-editor p-2 font-mono text-xs"
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            'whitespace-pre-wrap break-words',
            entry.stream === 'stderr' ? 'text-status-error' : 'text-foreground/80',
          )}
        >
          {entry.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
})
