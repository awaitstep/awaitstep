import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface MapBindingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bindingName: string
  bindingLabel: string
  resourceLabel?: string
  connectionName: string
  currentValue: string
  onSave: (resourceId: string) => Promise<void>
}

export function MapBindingDialog({
  open,
  onOpenChange,
  bindingName,
  bindingLabel,
  resourceLabel,
  connectionName,
  currentValue,
  onSave,
}: MapBindingDialogProps) {
  const [resourceId, setResourceId] = useState(currentValue)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setResourceId(currentValue)
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSave() {
    const value = resourceId.trim()
    if (!value) {
      setError('Choose the resource this binding uses on this connection.')
      return
    }
    setSaving(true)
    try {
      await onSave(value)
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the mapping.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Map {bindingName}</DialogTitle>
          <DialogDescription>
            Choose the {bindingLabel.toLowerCase()} this workflow uses on {connectionName}. This
            mapping belongs to the connection, not to the workflow code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="binding-resource-id">Resource ID or name</Label>
          <Input
            id="binding-resource-id"
            value={resourceId}
            onChange={(event) => {
              setResourceId(event.target.value)
              setError(null)
            }}
            placeholder={
              resourceLabel
                ? `Enter the ${resourceLabel.toLowerCase()}`
                : 'Paste the Cloudflare resource ID'
            }
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[11px] text-muted-foreground">
            You can find this in the Cloudflare dashboard. Other connections can map the same
            binding to a different resource.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button loading={saving} onClick={handleSave}>
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
