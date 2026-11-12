import { PanelBottom, PanelLeft, PanelRight, Rocket, Save, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ApiLibraryTreeItem } from '../../lib/library-api'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { cn } from '../../lib/utils'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
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

/** A thin rule between the top bar's groups (28d). */
function Divider() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-sm">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
        <ShellLink href={libraryHref} className="text-muted-foreground hover:text-foreground">
          Library
        </ShellLink>
        {item && (
          <>
            <span aria-hidden="true" className="text-muted-foreground/60">
              /
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <LibraryKindTile kind={item.kind} className="size-5 rounded-md text-2xs" />
              <span className="truncate font-semibold text-foreground">{item.name}</span>
            </span>
          </>
        )}
      </nav>
      {item && (
        <Badge variant="neutral">{item.latestVersion ? `v${item.latestVersion}` : 'draft'}</Badge>
      )}
      <Badge variant="neutral">{placeName}</Badge>
      <span className="flex-1" />
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={dirtyCount === 0}
          loading={saving}
          title={`Save (${formatShortcut(IDE_SHORTCUTS.save, isMac)})`}
        >
          <Save aria-hidden="true" />
          Save
          {dirtyCount > 0 && <Badge variant="warning">{dirtyCount}</Badge>}
        </Button>
      )}
      {canEdit && <Divider />}
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
      <Divider />
      <ToggleButton
        label={`Go to file (${formatShortcut(IDE_SHORTCUTS.quickOpen, isMac)})`}
        pressed={false}
        onClick={handleQuickOpen}
      >
        <Search className="size-4" aria-hidden="true" />
      </ToggleButton>
      {canEdit && publish && <Divider />}
      {canEdit && publish && (
        <Button
          type="button"
          size="sm"
          onClick={onPublish}
          disabled={publish.disabledReason !== null}
          title={publish.disabledReason ?? undefined}
        >
          <Rocket aria-hidden="true" />
          {publish.label}
        </Button>
      )}
    </header>
  )
}
