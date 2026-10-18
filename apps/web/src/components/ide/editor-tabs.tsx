import { X } from 'lucide-react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import { basename } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import { cn } from '../../lib/utils'
import { FileIcon } from './file-icon'

interface EditorTabsProps {
  files: ReadonlyMap<string, GeneratedFile>
}

export function EditorTabs({ files }: EditorTabsProps) {
  const { openPaths, activePath, openFile, closeFile } = useIdeStore(
    useShallow((s) => ({
      openPaths: s.openPaths,
      activePath: s.activePath,
      openFile: s.openFile,
      closeFile: s.closeFile,
    })),
  )

  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:thin]"
    >
      {openPaths.map((path) => (
        <EditorTab
          key={path}
          path={path}
          role={files.get(path)?.role ?? 'module'}
          active={path === activePath}
          onSelect={openFile}
          onClose={closeFile}
        />
      ))}
    </div>
  )
}

function EditorTab({
  path,
  role,
  active,
  onSelect,
  onClose,
}: {
  path: string
  role: GeneratedFile['role']
  active: boolean
  onSelect: (path: string) => void
  onClose: (path: string) => void
}) {
  function handleSelect() {
    onSelect(path)
  }

  function handleClose(event: React.MouseEvent) {
    event.stopPropagation()
    onClose(path)
  }

  // Middle-click closes, like every desktop editor's tab strip.
  function handleAuxClick(event: React.MouseEvent) {
    if (event.button === 1) onClose(path)
  }

  return (
    <div
      role="tab"
      aria-selected={active}
      title={path}
      onClick={handleSelect}
      onAuxClick={handleAuxClick}
      className={cn(
        'group relative flex min-w-0 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border pl-3 pr-1.5 text-xs transition-colors',
        active
          ? 'bg-background text-foreground'
          : 'bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <FileIcon role={role} className="h-3 w-3" />
      <span className="truncate">{basename(path)}</span>
      <button
        type="button"
        aria-label={`Close ${basename(path)}`}
        onClick={handleClose}
        className={cn(
          'ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-opacity hover:bg-muted/70 hover:text-foreground',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <X className="h-3 w-3" />
      </button>
      {active && <span className="absolute inset-x-0 top-0 h-px bg-primary" />}
    </div>
  )
}
