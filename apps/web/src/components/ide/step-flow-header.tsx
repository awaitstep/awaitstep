import { ChevronLeft, X } from 'lucide-react'
import { Button } from '../ui/button'
import { DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

interface StepFlowHeaderProps {
  mode: 'fast' | 'map'
  busy: boolean
  fileStem: string
  name: string
  onNameChange: (name: string) => void
  onClose: () => void
  onBack: () => void
}

export function StepFlowHeader({
  mode,
  busy,
  fileStem,
  name,
  onNameChange,
  onClose,
  onBack,
}: StepFlowHeaderProps) {
  if (mode === 'fast') {
    return (
      <div className="flex items-start justify-between border-b border-border px-5 py-4">
        <div>
          <DialogTitle>Add a step</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">New step file in this workflow.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="h-7 w-7 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(event.target.value)
  }

  return (
    <div className="flex items-start gap-2 border-b border-border px-4 py-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onBack}
        disabled={busy}
        aria-label="Back to quick add"
        className="h-7 w-7 shrink-0 text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <DialogTitle className="text-xs font-medium text-foreground">
          Where should it go?
        </DialogTitle>
        <div className="flex items-center gap-1 rounded-md border border-input px-1.5 font-mono text-2xs text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Input
            aria-label="Step name"
            value={name}
            maxLength={256}
            onChange={handleNameChange}
            placeholder={fileStem}
            className="h-7 border-0 bg-transparent px-0 text-right font-mono text-2xs text-foreground focus-visible:ring-0"
          />
          <span className="shrink-0">.ts</span>
        </div>
        <p className="text-2xs text-muted-foreground">
          Saved as <span className="font-mono">steps/{fileStem}.ts</span>
        </p>
      </div>
    </div>
  )
}
