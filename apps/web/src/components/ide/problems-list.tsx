import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import {
  countBySeverity,
  type Problem,
  type ProblemGroups,
  type ProblemSeverity,
} from '../../lib/ide/problems'
import { cn } from '../../lib/utils'

const SEVERITY_ICONS: Record<ProblemSeverity, { Icon: typeof CircleAlert; className: string }> = {
  error: { Icon: CircleAlert, className: 'text-status-error' },
  warning: { Icon: TriangleAlert, className: 'text-status-warning' },
  info: { Icon: Info, className: 'text-status-info' },
}

interface ProblemsListProps {
  groups: ProblemGroups
  /** When the saved files were last checked, as a clock time; null when never. */
  savedAt: string | null
  onSelect: (problem: Problem) => void
}

/** Problems in two groups: what the editor sees as you type, and what the server found in your saved files. */
export function ProblemsList({ groups, savedAt, onSelect }: ProblemsListProps) {
  if (groups.live.length === 0 && groups.saved.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
        <CircleAlert className="mb-1 h-5 w-5 text-muted-foreground/30" />
        <p className="text-xs font-medium text-muted-foreground">No problems detected</p>
        <p className="text-2xs text-muted-foreground">
          Errors and warnings in your files appear here.
        </p>
      </div>
    )
  }

  const counts = countBySeverity([...groups.live, ...groups.saved.map((s) => s.problem)])

  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-2xs text-muted-foreground">
        {counts.error} error{counts.error === 1 ? '' : 's'}, {counts.warning} warning
        {counts.warning === 1 ? '' : 's'}
        {counts.info > 0 && `, ${counts.info} info`}
      </div>
      <Group title="As you type" count={groups.live.length}>
        {groups.live.map((problem, index) => (
          <ProblemRow
            key={`${problem.file}:${problem.line}:${problem.column}:${index}`}
            problem={problem}
            pending={false}
            onSelect={onSelect}
          />
        ))}
      </Group>
      <Group
        title={savedAt ? `From your saved files · ${savedAt}` : 'From your saved files'}
        count={groups.saved.length}
      >
        {groups.saved.map(({ problem, pending }, index) => (
          <ProblemRow
            key={`${problem.file}:${problem.line}:${problem.column}:${index}`}
            problem={problem}
            pending={pending}
            onSelect={onSelect}
          />
        ))}
      </Group>
    </div>
  )
}

function Group({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <section aria-label={title}>
      <h3 className="px-3 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {count}
      </h3>
      {children}
    </section>
  )
}

function ProblemRow({
  problem,
  pending,
  onSelect,
}: {
  problem: Problem
  pending: boolean
  onSelect: (p: Problem) => void
}) {
  const { Icon, className } = SEVERITY_ICONS[problem.severity]

  function handleClick() {
    onSelect(problem)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-pending={pending || undefined}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-muted/40',
      )}
    >
      <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0', className)} />
      <span className="min-w-0 flex-1">
        <span className={pending ? 'text-muted-foreground' : 'text-foreground'}>
          {problem.message}
        </span>
        {problem.code && <span className="ml-1.5 text-muted-foreground">{problem.code}</span>}
        {pending && <span className="ml-2 text-muted-foreground">re-checked on save</span>}
        <span className="ml-2 font-mono text-muted-foreground">
          {problem.file ? `${problem.file}:${problem.line}:${problem.column}` : 'no location'}
        </span>
      </span>
    </button>
  )
}
