import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { copyToClipboard } from '../../lib/utils'
import type { ApiKeyCreated } from '../../lib/api-client'

export function KeyCreatedDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyCreated | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!apiKey) return
    await copyToClipboard(apiKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <Dialog.Root open={!!apiKey} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">API Key Created</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Copy your key now — it won't be shown again.
          </Dialog.Description>
          {apiKey && (
            <div className="mt-4">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <code className="flex-1 select-all break-all text-xs">{apiKey.key}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-status-warning">
                Store this key securely. You will not be able to see it again.
              </p>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button size="sm">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
