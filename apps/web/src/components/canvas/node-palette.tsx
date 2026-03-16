import { useState } from 'react'
import {
  Code,
  Clock,
  CalendarClock,
  GitBranch,
  Layers,
  Globe,
  Bell,
  Plus,
  X,
} from 'lucide-react'
import type { NodeType } from '@awaitstep/ir'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'

interface PaletteItem {
  type: NodeType
  label: string
  description: string
  icon: React.ReactNode
  accent: string
}

const paletteItems: PaletteItem[] = [
  { type: 'step', label: 'Step', description: 'Run custom code', icon: <Code className="h-4 w-4" />, accent: 'bg-blue-500/15 text-blue-400' },
  { type: 'sleep', label: 'Sleep', description: 'Pause for duration', icon: <Clock className="h-4 w-4" />, accent: 'bg-amber-500/15 text-amber-400' },
  { type: 'sleep-until', label: 'Sleep Until', description: 'Pause until timestamp', icon: <CalendarClock className="h-4 w-4" />, accent: 'bg-amber-500/15 text-amber-400' },
  { type: 'branch', label: 'Branch', description: 'Conditional logic', icon: <GitBranch className="h-4 w-4" />, accent: 'bg-purple-500/15 text-purple-400' },
  { type: 'parallel', label: 'Parallel', description: 'Run concurrently', icon: <Layers className="h-4 w-4" />, accent: 'bg-teal-500/15 text-teal-400' },
  { type: 'http-request', label: 'HTTP Request', description: 'Make an API call', icon: <Globe className="h-4 w-4" />, accent: 'bg-green-500/15 text-green-400' },
  { type: 'wait-for-event', label: 'Wait for Event', description: 'Pause until signal', icon: <Bell className="h-4 w-4" />, accent: 'bg-rose-500/15 text-rose-400' },
]

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [open, setOpen] = useState(false)

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/awaitstep-node-type', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => setOpen(!open)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[oklch(0.16_0_0)] shadow-lg transition-all hover:bg-[oklch(0.20_0_0)] hover:border-white/[0.12]',
                open && 'bg-primary border-primary/60 hover:bg-primary/90',
              )}
            >
              {open ? <X className="h-4 w-4 text-primary-foreground" /> : <Plus className="h-5 w-5 text-white/70" />}
            </button>
          </Tooltip.Trigger>
          {!open && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-lg"
              >
                Add Node
                <Tooltip.Arrow className="fill-white" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>

      {open && (
        <div className="w-56 rounded-xl border border-white/[0.08] bg-[oklch(0.15_0_0)] p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/25">
            Drag to canvas
          </div>
          {paletteItems.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onClick={() => onAddNode(item.type)}
              className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all hover:bg-white/[0.06] active:cursor-grabbing"
            >
              <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', item.accent)}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-white/85">{item.label}</div>
                <div className="text-[10px] leading-tight text-white/30">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
