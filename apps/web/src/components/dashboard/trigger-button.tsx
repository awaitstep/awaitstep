import { useState } from 'react'
import { Play } from 'lucide-react'
import { TriggerDialog } from '../canvas/trigger-dialog'

interface TriggerButtonProps {
  workflowId: string
}

export function TriggerButton({ workflowId }: TriggerButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="rounded-md p-1 text-status-success/60 transition-colors hover:bg-status-success/10 hover:text-status-success"
        title="Trigger run"
      >
        <Play size={14} />
      </button>
      <TriggerDialog
        open={open}
        onClose={() => setOpen(false)}
        workflowId={workflowId}
      />
    </>
  )
}
