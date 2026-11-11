import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Eraser, Search } from 'lucide-react'
import {
  countStderr,
  filterLogLines,
  formatLogTime,
  type LogStreamFilter,
} from '../../lib/ide/session-log'
import { cn } from '../../lib/utils'
import { useTestSessionStore, type SessionLogLine } from '../../stores/test-session-store'

const NEAR_BOTTOM_PX = 40

interface OutputPanelProps {
  sessionId: string | null
  lines: SessionLogLine[]
  clearedBefore: number
}

/**
 * Worker output, oldest first, with a time on every line. Follows the tail
 * while Follow is on; scrolling up turns it off so the next line does not
 * move what is being read, and scrolling back down (or pressing it) turns it
 * on again.
 *
 * The "at bottom" test is taken from the scroll event rather than measured
 * after a render: by then the new rows are already in the DOM, which makes
 * any batch of more than a line or two look like the reader had scrolled away.
 */
export function OutputPanel({ sessionId, lines, clearedBefore }: OutputPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const [stream, setStream] = useState<LogStreamFilter>('all')
  const [text, setText] = useState('')

  const shown = filterLogLines(lines, { clearedBefore, stream: 'all', text: '' })
  const stderrCount = countStderr(shown)
  const visible = filterLogLines(shown, { clearedBefore: 0, stream, text })

  function handleScroll() {
    const container = containerRef.current
    if (!container) return
    setFollow(
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX,
    )
  }

  // The log's own scroll position, never scrollIntoView: that scrolls every
  // ancestor too, and the dock's header and payload editor would slide out of
  // view while someone types.
  function scrollToEnd() {
    const container = containerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }

  function handleToggleFollow() {
    const next = !follow
    setFollow(next)
    if (next) scrollToEnd()
  }

  function handleClear() {
    if (sessionId) useTestSessionStore.getState().clearView(sessionId)
  }

  function handleText(event: React.ChangeEvent<HTMLInputElement>) {
    setText(event.target.value)
  }

  function handleAll() {
    setStream('all')
  }

  function handleStderr() {
    setStream('stderr')
  }

  // The newest line's id rather than the count: once the buffer is full the
  // count stops changing while lines keep arriving.
  const newestId = visible.at(-1)?.id
  useLayoutEffect(() => {
    if (follow) scrollToEnd()
  }, [newestId, follow])

  const empty =
    shown.length === 0
      ? 'Output appears here while a test session runs.'
      : visible.length === 0
        ? 'No lines match.'
        : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-1.5">
        <Chip active={stream === 'all'} onClick={handleAll}>
          All
        </Chip>
        <Chip active={stream === 'stderr'} onClick={handleStderr}>
          stderr {stderrCount}
        </Chip>
        <label className="relative min-w-24 flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground"
          />
          <input
            type="text"
            value={text}
            onChange={handleText}
            placeholder="Filter output"
            aria-label="Filter output"
            spellCheck={false}
            className="h-6 w-full rounded border border-input bg-editor pl-6 pr-2 text-2xs"
          />
        </label>
        <Chip active={follow} onClick={handleToggleFollow} pressed={follow}>
          <ArrowDownToLine className="h-3 w-3" />
          {follow ? 'Following' : 'Follow'}
        </Chip>
        <button
          type="button"
          onClick={handleClear}
          disabled={shown.length === 0}
          title="Clears this view. The session keeps logging."
          className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-2xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Eraser className="h-3 w-3" />
          Clear view
        </button>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Test session output"
        className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-editor p-2 font-mono text-xs"
      >
        {empty ? (
          <p className="font-sans text-2xs text-muted-foreground">{empty}</p>
        ) : (
          visible.map((line) => <LogRow key={line.id} line={line} />)
        )}
      </div>
    </div>
  )
}

function LogRow({ line }: { line: SessionLogLine }) {
  return (
    <div
      className={cn(
        'flex gap-2',
        line.stream === 'stderr' ? 'text-status-error' : 'text-foreground',
      )}
    >
      <time className="shrink-0 tabular-nums text-muted-foreground">
        {formatLogTime(line.timestamp)}
      </time>
      <span className="min-w-0 whitespace-pre-wrap break-words">{line.text}</span>
    </div>
  )
}

function Chip({
  active,
  pressed,
  onClick,
  children,
}: {
  active: boolean
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed ?? active}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded border px-2 text-2xs transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
