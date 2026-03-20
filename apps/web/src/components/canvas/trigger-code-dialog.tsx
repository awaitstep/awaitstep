import { lazy, Suspense } from 'react'
import { RotateCcw } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../ui/button'
import { useWorkflowStore } from '../../stores/workflow-store'

const LazyTriggerCodeEditor = lazy(() => import('./trigger-code-editor').then((m) => ({ default: m.TriggerCodeEditor })))

interface TriggerCodeDialogProps {
  open: boolean
  onClose: () => void
}

export function TriggerCodeDialog({ open, onClose }: TriggerCodeDialogProps) {
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const setTriggerCode = useWorkflowStore((s) => s.setTriggerCode)

  const isCustom = triggerCode && triggerCode !== ''

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <Dialog.Title className="text-[13px] font-semibold text-foreground">
              Custom Entry Point
            </Dialog.Title>
            {isCustom && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                onClick={() => setTriggerCode('')}
              >
                <RotateCcw className="h-3 w-3" /> Reset to default
              </Button>
            )}
          </div>

          <div className="p-5">
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground/60">
              Code inside the <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">export default {'{'} async fetch() {'{'} ... {'}'} {'}'}</code> handler.
              Has access to <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">request</code>, <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">env</code>, and <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">ctx</code>.
            </p>
            <Suspense fallback={<div className="h-[350px] rounded-lg border border-input bg-[oklch(0.12_0_0)]" />}>
              <LazyTriggerCodeEditor height="350px" />
            </Suspense>
          </div>

          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
