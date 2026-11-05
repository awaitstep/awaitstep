import { Lock } from 'lucide-react'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { fileLanguage } from '../../lib/ide/file-tree'
import { unsavedLabel, type SessionStatus, type StatusTone } from '../../lib/ide/status-bar'
import { isMacPlatform } from '../../lib/platform'
import { cn } from '../../lib/utils'
import { useIdeStore } from '../../stores/ide-store'
import { basename } from '../../lib/ide/file-tree'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const DOT: Record<StatusTone, string> = {
  idle: 'bg-muted-foreground',
  ok: 'bg-status-success',
  warn: 'bg-status-warning',
  info: 'bg-status-info',
  error: 'bg-status-error',
}

interface StatusBarProps {
  /** The version on screen, and whether it is an older one. */
  version: number
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
  onOpenFile: (path: string) => void
  onSaveAll: () => void
  onDiscard: () => void
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
  onOpenFile,
  onSaveAll,
  onDiscard,
}: StatusBarProps) {
  const cursor = useIdeStore((s) => s.cursor)
  const isMac = isMacPlatform()
  const unsavedText = unsavedLabel(unsaved.length)

  function handleGoToLine() {
    useIdeStore.getState().editorHandle?.trigger('editor.action.gotoLine')
  }

  return (
    <div
      aria-label="Workspace status"
      className="flex h-6 shrink-0 items-center gap-0.5 border-t border-border bg-card px-1.5 text-[11px] text-muted-foreground"
    >
      {historical ? (
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Show the unsaved files"
              className="inline-flex h-5 items-center rounded bg-status-warning/10 px-2 text-status-warning transition-colors hover:bg-status-warning/20"
            >
              {unsavedText}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-[260px]">
            <div className="px-2.5 py-1 text-[11px] text-muted-foreground">Unsaved files</div>
            <DropdownMenuSeparator />
            {unsaved.map((path) => (
              <UnsavedRow key={path} path={path} onOpenFile={onOpenFile} />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSaveAll} className="text-xs">
              Save all
              <span className="ml-auto pl-4 font-mono text-[11px] text-muted-foreground">
                {formatShortcut(IDE_SHORTCUTS.saveAll, isMac)}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDiscard} className="text-xs">
              Discard all changes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

function UnsavedRow({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  function handleSelect() {
    onOpenFile(path)
  }
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  return (
    <DropdownMenuItem onSelect={handleSelect} className="text-xs">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" />
      {basename(path)}
      {folder && <span className="truncate text-[11px] text-muted-foreground">{folder}</span>}
    </DropdownMenuItem>
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
