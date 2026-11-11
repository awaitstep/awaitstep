import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useApi, useApiReady } from '../../contexts/api-client-context'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Bone } from '../ui/skeletons'
import { useCopyStatus } from '../ui/use-copy-status'

interface DeployPreviewCardProps {
  workflowId: string
  connectionId: string
  /** The settings as edited, unsaved: the preview shows what would be sent. */
  config: Record<string, unknown>
  /** The provider's file name, shown while closed. */
  filename: string
}

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

/** The generated config file (25a closed, 25b open), asked for only once it is opened. */
export function DeployPreviewCard({
  workflowId,
  connectionId,
  config,
  filename,
}: DeployPreviewCardProps) {
  const api = useApi()
  const ready = useApiReady()
  const [open, setOpen] = useState(false)
  // Asked again once typing pauses, not on every keystroke.
  const settled = useDebouncedValue(config, 400)
  const preview = useQuery({
    queryKey: ['deploy-config-preview', workflowId, connectionId, settled],
    queryFn: () => api.getDeployConfigPreview(workflowId, connectionId, settled),
    enabled: ready && open && !!connectionId,
    // The last file stays up while the next loads — only for the same account.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === connectionId ? previous : undefined,
  })
  const text = preview.data ? JSON.stringify(preview.data.content, null, 2) : undefined
  const copy = useCopyStatus(text)

  function handleToggle() {
    setOpen((was) => !was)
  }

  function handleCopy() {
    void copy.copy()
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={handleToggle}
        className="h-auto justify-start gap-2.5 rounded-none px-5 py-3.5 text-left font-normal"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90 text-foreground',
          )}
        />
        <span className="flex-1 text-sm font-medium text-foreground">
          {preview.data?.filename ?? filename}
        </span>
        {!open && <span className="text-xs text-muted-foreground">What gets sent</span>}
      </Button>
      {open && (
        <div className="flex flex-col border-t border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
            <span className="flex-1 text-xs text-muted-foreground">Generated · read-only</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={handleCopy}
              disabled={!text}
            >
              {COPY_LABEL[copy.status]}
            </Button>
          </div>
          {text ? (
            <pre className="m-0 max-h-[260px] overflow-auto px-4 py-3.5 font-mono text-xs leading-relaxed text-foreground">
              {text}
            </pre>
          ) : preview.isError ? (
            <p role="alert" className="px-4 py-3.5 text-xs text-muted-foreground">
              Couldn’t build the preview. {preview.error.message}
            </p>
          ) : (
            <div className="flex flex-col gap-2 px-4 py-3.5">
              <Bone className="h-3 w-48" />
              <Bone className="h-3 w-36" />
              <Bone className="h-3 w-56" />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
