import { useId } from 'react'
import { Switch } from '../ui/switch'

interface InlineSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** "Inline — no step": a step or a custom node runs in the body, without durability. */
export function InlineSwitch({ checked, onChange }: InlineSwitchProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} label="Inline — no step" />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-xs text-foreground">Inline — no step</div>
        <div className="text-2xs text-muted-foreground/60">
          Runs in the body. No retries, timeout or durability.
        </div>
      </label>
    </div>
  )
}
