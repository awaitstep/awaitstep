import { Lock } from 'lucide-react'
import { fileLanguage } from '../../lib/ide/file-tree'
import { unsavedLabel, type SessionStatus, type StatusTone } from '../../lib/ide/status-bar'
import { cn } from '../../lib/utils'
import { useIdeStore } from '../../stores/ide-store'

const DOT: Record<StatusTone, string> = {
  idle: 'bg-muted-foreground',
  ok: 'bg-status-success',
  warn: 'bg-status-warning',
  info: 'bg-status-info',
  error: 'bg-status-error',
}

interface StatusBarProps {
  /** The version on screen, and whether it is an older one. Null: never saved on the canvas. */
  version: number | null
  historical: boolean
  session: SessionStatus
  errors: number
  warnings: number
  /** Unsaved files, in the order they should be listed. */
  unsaved: string[]
  canEdit: boolean
  activePath: string | null
  readOnly: boolean
  onOpenLatest: () => void
  onShowSession: () => void
  onShowProblems: () => void
  /** Opens the Unsaved changes tab. */
  onReview: () => void
}

/** The line under the workspace: where you are, what is unsaved, what the session runs. */
export function StatusBar({
  version,
  historical,
  session,
  errors,
  warnings,
  unsaved,
  canEdit,
  activePath,
  readOnly,
  onOpenLatest,
  onShowSession,
  onShowProblems,
  onReview,
}: StatusBarProps) {
  const cursor = useIdeStore((s) => s.cursor)
  const unsavedText = unsavedLabel(unsaved.length)

  // Not `onClick={onReview}`: the click event would arrive as the path to review.
  function handleReview() {
    onReview()
  }

  function handleGoToLine() {
    useIdeStore.getState().editorHandle?.trigger('editor.action.gotoLine')
  }

  return (
    <div
      aria-label="Workspace status"
      className="flex h-6 shrink-0 items-center gap-0.5 border-t border-border bg-card px-1.5 text-2xs text-muted-foreground"
    >
      {version === null ? (
        <span
          className="px-2"
          title="Generated files appear after the first version is saved on the canvas"
        >
          No version yet
        </span>
      ) : historical ? (
        <Item onClick={onOpenLatest} title="You’re viewing an older version. Open the latest." warn>
          Viewing v{version}
        </Item>
      ) : (
        <span className="px-2 font-mono" title="The version you are looking at">
          v{version}
        </span>
      )}
      <Item onClick={onShowSession} title="Show the test session">
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT[session.tone])} />
        <span className={cn(session.tone === 'warn' && 'text-status-warning')}>
          {session.label}
        </span>
      </Item>
      <Item onClick={onShowProblems} title="Show problems">
        <span className={cn(errors > 0 && 'text-status-error')}>⊗ {errors}</span>
        <span className={cn(warnings > 0 && 'text-status-warning')}>⚠ {warnings}</span>
      </Item>
      <span className="flex-1" />
      {readOnly && (
        <span
          className="inline-flex items-center gap-1 px-2"
          title="This file can’t be edited here"
        >
          <Lock className="h-3 w-3" />
          Read-only
        </span>
      )}
      {unsavedText && canEdit && (
        <button
          type="button"
          onClick={handleReview}
          title="Review the unsaved changes"
          className="inline-flex h-5 items-center rounded bg-status-warning/10 px-2 text-status-warning transition-colors hover:bg-status-warning/20"
        >
          {unsavedText}
        </button>
      )}
      {activePath && (
        <>
          <Item onClick={handleGoToLine} title="Go to line">
            <span className="tabular-nums">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          </Item>
          <span className="px-2" title="The language of this file">
            {fileLanguage(activePath)}
          </span>
          <span className="px-2" title="Indentation is fixed at 2 spaces">
            Spaces: 2
          </span>
        </>
      )}
    </div>
  )
}

function Item({
  onClick,
  title,
  warn,
  children,
}: {
  onClick: () => void
  title: string
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded px-2 transition-colors hover:bg-muted/70 hover:text-foreground',
        warn && 'bg-status-warning/10 text-status-warning',
      )}
    >
      {children}
    </button>
  )
}
