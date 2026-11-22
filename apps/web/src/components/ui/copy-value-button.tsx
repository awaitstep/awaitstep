import { Button } from './button'
import { useCopyStatus } from './use-copy-status'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

/** A small "Copy" link that puts `value` on the clipboard and says how it went. */
export function CopyValueButton({ value, label }: { value: string; label: string }) {
  const copy = useCopyStatus(value)

  function handleCopy() {
    void copy.copy()
  }

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto shrink-0 p-0 text-xs"
      aria-label={`Copy the ${label.toLowerCase()}`}
      onClick={handleCopy}
    >
      {COPY_LABEL[copy.status]}
    </Button>
  )
}
