import { Check, Search, Sparkles } from 'lucide-react'
import type { ReleaseTag } from '../../../types/dashboard/inbox'
import { Button } from '../../ui/button'
import { Tile } from '../../ui/tile'

/** Shown above the notes when the viewer has seen them all (board `WhatsNew`, `uptodate`). */
export function UpToDateNote() {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-status-success/30 bg-tone-ok/40 px-4 py-3">
      <Check className="size-4 shrink-0 text-status-success" aria-hidden="true" />
      <p className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">You’ve seen everything</span>
        <span className="text-xs text-muted-foreground">Nothing new since your last visit.</span>
      </p>
    </div>
  )
}

/** No release notes at all: a new or self-hosted instance (board `WhatsNew`, `none`). */
export function NoReleaseNotes() {
  return (
    <div className="my-auto flex flex-col items-center gap-3 px-7 py-14 text-center">
      <Tile size="lg" className="border border-border">
        <Sparkles />
      </Tile>
      <p className="text-base font-semibold text-foreground">Nothing to show yet</p>
      <p className="max-w-[330px] text-sm leading-relaxed text-muted-foreground">
        Release notes will show up here, with a link to what changed.
      </p>
      <p className="max-w-[330px] text-xs leading-relaxed text-muted-foreground">
        Older releases are in the full changelog below.
      </p>
    </div>
  )
}

const TAG_NOUN: Record<ReleaseTag, string> = {
  new: 'new features',
  improved: 'improvements',
  fixed: 'fixes',
}

interface NoMatchingNotesProps {
  tag: ReleaseTag
  onShowAll: () => void
}

/** A tag with no notes under it. */
export function NoMatchingNotes({ tag, onShowAll }: NoMatchingNotesProps) {
  return (
    <div className="my-auto flex flex-col items-center gap-2.5 px-7 py-14 text-center">
      <Tile>
        <Search />
      </Tile>
      <p className="text-sm font-semibold text-foreground">No {TAG_NOUN[tag]} in these notes</p>
      <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
        Older releases are in the full changelog.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
        Show everything
      </Button>
    </div>
  )
}
