import { ArrowLeft, PanelBottom, PanelLeft, PanelRight, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ApiLibraryTreeItem } from '../../lib/library-api'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { cn } from '../../lib/utils'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { Badge } from '../ui/badge'
import { Button, buttonVariants } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { LibraryKindTile } from '../library/parts/library-kind-tile'

interface LibraryIdeHeaderProps {
  libraryHref: string
  placeName: string
  item: ApiLibraryTreeItem | null
  dirtyCount: number
  saving: boolean
  canEdit: boolean
  onSave: () => void
  /** "Publish v1.4.3", or why it can't publish yet. */
  publish: { label: string; disabledReason: string | null } | null
  onPublish: () => void
}

function ToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('size-7 text-muted-foreground', pressed && 'text-foreground')}
    >
      {children}
    </Button>
  )
}

/** The Library IDE's top bar (28d): where you are, Save with its count, the panes, and Publish. */
export function LibraryIdeHeader({
  libraryHref,
  placeName,
  item,
  dirtyCount,
  saving,
  canEdit,
  onSave,
  publish,
  onPublish,
}: LibraryIdeHeaderProps) {
  const isMac = isMacPlatform()
  const layout = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
      toggleExplorer: s.toggleExplorer,
      toggleDock: s.toggleDock,
      togglePreview: s.togglePreview,
    })),
  )
  const showDialog = useIdeStore((s) => s.showDialog)

  function handleQuickOpen() {
    showDialog('quickOpen')
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <ShellLink href={libraryHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <ArrowLeft aria-hidden="true" />
        Library
      </ShellLink>
      {item && (
        <span className="flex min-w-0 items-center gap-2">
          <LibraryKindTile kind={item.kind} />
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
          <Badge variant={item.latestVersion ? 'outline' : 'neutral'}>
            {item.latestVersion ? `v${item.latestVersion}` : 'draft'}
          </Badge>
        </span>
      )}
      <Badge variant="neutral">{placeName}</Badge>
      <span className="flex-1" />
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={dirtyCount === 0}
          loading={saving}
          title={`Save (${formatShortcut(IDE_SHORTCUTS.save, isMac)})`}
        >
          Save
          {dirtyCount > 0 && <Badge variant="warning">{dirtyCount}</Badge>}
        </Button>
      )}
      <ToggleButton
        label={`Toggle explorer (${formatShortcut(IDE_SHORTCUTS.toggleExplorer, isMac)})`}
        pressed={layout.explorerOpen}
        onClick={layout.toggleExplorer}
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </ToggleButton>
      <ToggleButton
        label={`Toggle panel (${formatShortcut(IDE_SHORTCUTS.toggleDock, isMac)})`}
        pressed={layout.dockOpen}
        onClick={layout.toggleDock}
      >
        <PanelBottom className="size-4" aria-hidden="true" />
      </ToggleButton>
      <ToggleButton
        label="Toggle details"
        pressed={layout.previewOpen}
        onClick={layout.togglePreview}
      >
        <PanelRight className="size-4" aria-hidden="true" />
      </ToggleButton>
      <ToggleButton
        label={`Go to file (${formatShortcut(IDE_SHORTCUTS.quickOpen, isMac)})`}
        pressed={false}
        onClick={handleQuickOpen}
      >
        <Search className="size-4" aria-hidden="true" />
      </ToggleButton>
      {canEdit && publish && (
        <Button
          type="button"
          size="sm"
          onClick={onPublish}
          disabled={publish.disabledReason !== null}
          title={publish.disabledReason ?? undefined}
        >
          {publish.label}
        </Button>
      )}
    </header>
  )
}
