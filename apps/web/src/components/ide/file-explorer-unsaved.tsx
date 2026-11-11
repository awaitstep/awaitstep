import { basename, dirname } from '../../lib/ide/file-tree'

interface UnsavedSectionProps {
  /** The unsaved files, in review order. */
  paths: string[]
  /** Opens the Unsaved changes tab, on `path` when given. */
  onReview: (path?: string) => void
}

/**
 * Sits above the project tree while anything is unsaved: the same files, one
 * click from their diff. The tree below still opens the files themselves.
 */
export function UnsavedSection({ paths, onReview }: UnsavedSectionProps) {
  function handleReviewAll() {
    onReview()
  }

  if (paths.length === 0) return null
  return (
    <section aria-label="Unsaved files" className="shrink-0 border-b border-border py-1">
      <div className="flex items-center px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Unsaved · {paths.length}</span>
        <button
          type="button"
          onClick={handleReviewAll}
          className="ml-auto rounded px-1.5 py-0.5 text-2xs font-medium normal-case tracking-normal text-primary hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Review
        </button>
      </div>
      <ul className="max-h-40 overflow-auto">
        {paths.map((path) => (
          <li key={path}>
            <UnsavedRow path={path} onReview={onReview} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function UnsavedRow({ path, onReview }: { path: string; onReview: (path?: string) => void }) {
  function handleClick() {
    onReview(path)
  }
  const folder = dirname(path)
  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Review the changes to ${path}`}
      className="flex w-full items-baseline gap-1.5 px-3 py-1 text-left text-xs text-foreground/90 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span
        className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-status-warning"
        aria-hidden="true"
      />
      <span className="truncate">{basename(path)}</span>
      {folder && <span className="truncate text-2xs text-muted-foreground">{folder}</span>}
    </button>
  )
}
