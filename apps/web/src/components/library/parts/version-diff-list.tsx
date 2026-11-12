import type { FileDiff } from '../../../lib/library/version-diff'
import { cn } from '../../../lib/utils'

const MARK = { add: '+', remove: '−', same: ' ' } as const
const LINE_CLASS = {
  add: 'bg-status-success/10 text-status-success',
  remove: 'bg-status-error/10 text-status-error',
  same: 'text-muted-foreground',
} as const

/** Per-file changes between two versions, each with its +/− counts (28i). */
export function VersionDiffList({ diffs, loading }: { diffs: FileDiff[]; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading the changes…</p>
  if (diffs.length === 0) {
    return <p className="text-xs text-muted-foreground">No code changed between them.</p>
  }
  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-auto">
      {diffs.map((diff) => (
        <section
          key={diff.path}
          aria-label={diff.path}
          className="overflow-hidden rounded-lg border border-border"
        >
          <header className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs">
            <span className="font-mono text-foreground">{diff.path}</span>
            {diff.status !== 'changed' && (
              <span className="text-muted-foreground">({diff.status})</span>
            )}
            <span className="ml-auto text-status-success">+{diff.added}</span>
            <span className="text-status-error">−{diff.removed}</span>
          </header>
          <pre className="m-0 overflow-x-auto p-0 font-mono text-2xs leading-5">
            {diff.lines.map((line, index) => (
              <div key={index} className={cn('px-3', LINE_CLASS[line.kind])}>
                <span aria-hidden="true" className="mr-2 select-none">
                  {MARK[line.kind]}
                </span>
                {line.text}
              </div>
            ))}
          </pre>
        </section>
      ))}
    </div>
  )
}
