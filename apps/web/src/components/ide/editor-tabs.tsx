import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import { actionToast } from '../../lib/action-toast'
import { basename } from '../../lib/ide/file-tree'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeStore } from '../../stores/ide-store'
import { cn, copyToClipboard } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { nextTabIndex } from '../../lib/ide/tabs'
import { FileIcon } from './file-icon'

interface EditorTabsProps {
  files: ReadonlyMap<string, GeneratedFile>
  dirty: ReadonlySet<string>
  /** Drops one file's unsaved edits, with an Undo toast. */
  onRevertFile: (path: string) => void
}

export function EditorTabs({ files, dirty, onRevertFile }: EditorTabsProps) {
  const { openPaths, activePath, openFile, requestClose } = useIdeStore(
    useShallow((s) => ({
      openPaths: s.openPaths,
      activePath: s.activePath,
      openFile: s.openFile,
      requestClose: s.requestClose,
    })),
  )

  function handleClose(path: string) {
    requestClose([path])
  }

  function handleCloseAll() {
    requestClose(openPaths)
  }

  // Arrow keys move between tabs (the active one is the tab stop), Home and
  // End jump to the ends, and Esc hands the keyboard back to the editor.
  function handleTabListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      useIdeStore.getState().editorHandle?.focus()
      return
    }
    const next = nextTabIndex(
      event.key,
      activePath ? openPaths.indexOf(activePath) : -1,
      openPaths.length,
    )
    if (next === null) return
    event.preventDefault()
    openFile(openPaths[next]!)
    const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[next]?.focus()
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleTabListKeyDown}
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:thin]"
    >
      {openPaths.map((path) => (
        <EditorTab
          key={path}
          path={path}
          role={files.get(path)?.role ?? 'module'}
          active={path === activePath}
          dirty={dirty.has(path)}
          onSelect={openFile}
          onClose={handleClose}
          onCloseAll={handleCloseAll}
          onRevert={onRevertFile}
        />
      ))}
    </div>
  )
}

function EditorTab({
  path,
  role,
  active,
  dirty,
  onSelect,
  onClose,
  onCloseAll,
  onRevert,
}: {
  path: string
  role: GeneratedFile['role']
  active: boolean
  dirty: boolean
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onCloseAll: () => void
  onRevert: (path: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tabRef = useRef<HTMLDivElement>(null)
  const closeHint = formatShortcut(IDE_SHORTCUTS.closeTab, isMacPlatform())

  function handleSelect() {
    onSelect(path)
  }

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault()
    setMenuOpen(true)
  }

  // The active tab is the one tab stop; arrows move between tabs.
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      setMenuOpen(true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelect()
    }
  }

  // The menu is portaled, but React events still bubble through the portal to
  // the tab: without this, choosing Close re-opened the tab it just closed.
  function stopBubbling(event: React.SyntheticEvent) {
    event.stopPropagation()
  }

  // Radix would focus the (inert) anchor; the tab itself is the right place.
  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
    tabRef.current?.focus()
  }

  function handleMenuClose() {
    onClose(path)
  }

  function handleMenuRevert() {
    onRevert(path)
  }

  function handleMenuCopyPath() {
    copyToClipboard(path)
      .then(() => actionToast.success('Path copied'))
      .catch(() => actionToast.error('Couldn’t copy the path'))
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
      ref={tabRef}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={dirty ? `${path} · unsaved changes` : path}
      onClick={handleSelect}
      onAuxClick={handleAuxClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex min-w-0 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border pl-3 pr-1.5 text-xs transition-colors',
        active
          ? 'bg-background text-foreground'
          : 'bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <FileIcon role={role} className="h-3 w-3" />
      <span className={cn('truncate', dirty && 'italic')}>{basename(path)}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${basename(path)}`}
        onClick={handleClose}
        className={cn(
          'ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-opacity hover:bg-muted/70 hover:text-foreground',
          active || dirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {dirty ? (
          <>
            <span className="h-2 w-2 rounded-full bg-status-warning group-hover:hidden" />
            <X className="hidden h-3 w-3 group-hover:block" />
          </>
        ) : (
          <X className="h-3 w-3" />
        )}
      </button>
      {active && <span className="absolute inset-x-0 top-0 h-px bg-primary" />}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* The tab is the anchor; it opens on right-click or ⇧F10, never on a plain click. */}
        <DropdownMenuTrigger asChild>
          <span className="pointer-events-none absolute inset-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[190px]"
          onClick={stopBubbling}
          onKeyDown={stopBubbling}
          onCloseAutoFocus={handleMenuCloseAutoFocus}
        >
          <DropdownMenuItem onSelect={handleMenuClose} className="text-xs">
            Close
            <span className="ml-auto pl-4 text-[11px] text-muted-foreground">{closeHint}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseAll} className="text-xs">
            Close all
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleMenuRevert} disabled={!dirty} className="text-xs">
            Revert file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleMenuCopyPath} className="text-xs">
            Copy path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
