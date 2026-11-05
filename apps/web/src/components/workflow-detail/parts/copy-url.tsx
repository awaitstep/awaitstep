import { Check, Copy, Link2 } from 'lucide-react'
import { useCopyStatus } from '../../ui/use-copy-status'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

/** A URL in a box, shown without its scheme, with Copy (the band's Trigger, a function's URL card). */
export function CopyUrl({ url }: { url: string }) {
  const copy = useCopyStatus(url)

  function handleCopy() {
    void copy.copy()
  }

  return (
    <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
      <Link2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
        {url.replace(/^https:\/\//, '')}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-status-success"
      >
        {copy.status === 'copied' ? (
          <Check aria-hidden="true" className="size-3" />
        ) : (
          <Copy aria-hidden="true" className="size-3" />
        )}
        {COPY_LABEL[copy.status]}
      </button>
    </span>
  )
}
