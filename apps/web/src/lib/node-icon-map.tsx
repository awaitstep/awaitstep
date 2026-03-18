import {
  Code,
  Clock,
  CalendarClock,
  GitBranch,
  Layers,
  Globe,
  Bell,
  Puzzle,
} from 'lucide-react'

export interface NodeVisuals {
  icon: React.ReactNode
  paletteIcon: React.ReactNode
  accent: string
}

const iconMap: Record<string, NodeVisuals> = {
  'step': {
    icon: <Code className="h-2.5 w-2.5" />,
    paletteIcon: <Code className="h-4 w-4" />,
    accent: 'bg-blue-500/15 text-blue-400',
  },
  'sleep': {
    icon: <Clock className="h-2.5 w-2.5" />,
    paletteIcon: <Clock className="h-4 w-4" />,
    accent: 'bg-amber-500/15 text-amber-400',
  },
  'sleep-until': {
    icon: <CalendarClock className="h-2.5 w-2.5" />,
    paletteIcon: <CalendarClock className="h-4 w-4" />,
    accent: 'bg-amber-500/15 text-amber-400',
  },
  'branch': {
    icon: <GitBranch className="h-2.5 w-2.5" />,
    paletteIcon: <GitBranch className="h-4 w-4" />,
    accent: 'bg-purple-500/15 text-purple-400',
  },
  'parallel': {
    icon: <Layers className="h-2.5 w-2.5" />,
    paletteIcon: <Layers className="h-4 w-4" />,
    accent: 'bg-teal-500/15 text-teal-400',
  },
  'http-request': {
    icon: <Globe className="h-2.5 w-2.5" />,
    paletteIcon: <Globe className="h-4 w-4" />,
    accent: 'bg-green-500/15 text-green-400',
  },
  'wait-for-event': {
    icon: <Bell className="h-2.5 w-2.5" />,
    paletteIcon: <Bell className="h-4 w-4" />,
    accent: 'bg-rose-500/15 text-rose-400',
  },
}

const defaultVisuals: NodeVisuals = {
  icon: <Puzzle className="h-2.5 w-2.5" />,
  paletteIcon: <Puzzle className="h-4 w-4" />,
  accent: 'bg-indigo-500/15 text-indigo-400',
}

export function getNodeVisuals(nodeId: string): NodeVisuals {
  return iconMap[nodeId] ?? defaultVisuals
}
