import { Rocket } from 'lucide-react'
import type { LibraryKind } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { Button } from '../../ui/button'
import { ModalDialog } from '../../ui/modal-dialog'
import { LibraryKindTile } from '../parts/library-kind-tile'

export interface HistoryPublish {
  /** "Publish v1.0.0". */
  label: string
  /** Why it can't publish yet (unsaved files, problems), or null. */
  disabledReason: string | null
  onPublish: () => void
}

interface VersionHistoryEmptyProps {
  item: { kind: LibraryKind; name: string }
  /** When the draft was last saved, if known. */
  savedAt?: string
  /** Where the draft lives: "Drafts stay in Sales." */
  placeName?: string
  /** The IDE can publish from here; the Library page leaves it out. */
  publish?: HistoryPublish
  onClose: () => void
}

/** Version history for an item never published (28j): what publishing would give it. */
export function VersionHistoryEmpty({
  item,
  savedAt,
  placeName,
  publish,
  onClose,
}: VersionHistoryEmptyProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handlePublish() {
    if (!publish) return
    onClose()
    publish.onPublish()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={<LibraryKindTile kind={item.kind} />}
      title={item.name}
      description="No versions"
      footerStart={
        placeName ? (
          <span className="text-xs text-muted-foreground">Drafts stay in {placeName}.</span>
        ) : undefined
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {publish && (
            <Button
              type="button"
              onClick={handlePublish}
              disabled={publish.disabledReason !== null}
              title={publish.disabledReason ?? undefined}
            >
              <Rocket aria-hidden="true" />
              {publish.label}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center gap-3.5 px-4 py-6 text-center">
        <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
          <Rocket className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-semibold text-foreground">Nothing published yet</p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Publishing records a version with its code, so you can compare it later or go back to
            it.
          </p>
        </div>
        {savedAt && (
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-2xs text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-warning" />
            Draft · saved {timeAgoOrDay(savedAt)}
          </span>
        )}
      </div>
    </ModalDialog>
  )
}
