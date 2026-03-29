import {
  Code,
  Clock,
  CalendarClock,
  GitBranch,
  Layers,
  Globe,
  Bell,
  Puzzle,
  ShieldAlert,
  Repeat,
  CircleStop,
  Workflow,
  Zap,
} from 'lucide-react'

export interface NodeVisuals {
  icon: React.ReactNode
  paletteIcon: React.ReactNode
  accent: string
}

const iconMap: Record<string, NodeVisuals> = {
  step: {
    icon: <Code className="h-2.5 w-2.5" />,
    paletteIcon: <Code className="h-4 w-4" />,
    accent: 'bg-blue-500/15 text-blue-400',
  },
  sleep: {
    icon: <Clock className="h-2.5 w-2.5" />,
    paletteIcon: <Clock className="h-4 w-4" />,
    accent: 'bg-amber-500/15 text-amber-400',
  },
  sleep_until: {
    icon: <CalendarClock className="h-2.5 w-2.5" />,
    paletteIcon: <CalendarClock className="h-4 w-4" />,
    accent: 'bg-amber-500/15 text-amber-400',
  },
  branch: {
    icon: <GitBranch className="h-2.5 w-2.5" />,
    paletteIcon: <GitBranch className="h-4 w-4" />,
    accent: 'bg-purple-500/15 text-purple-400',
  },
  parallel: {
    icon: <Layers className="h-2.5 w-2.5" />,
    paletteIcon: <Layers className="h-4 w-4" />,
    accent: 'bg-teal-500/15 text-teal-400',
  },
  http_request: {
    icon: <Globe className="h-2.5 w-2.5" />,
    paletteIcon: <Globe className="h-4 w-4" />,
    accent: 'bg-green-500/15 text-green-400',
  },
  wait_for_event: {
    icon: <Bell className="h-2.5 w-2.5" />,
    paletteIcon: <Bell className="h-4 w-4" />,
    accent: 'bg-rose-500/15 text-rose-400',
  },
  try_catch: {
    icon: <ShieldAlert className="h-2.5 w-2.5" />,
    paletteIcon: <ShieldAlert className="h-4 w-4" />,
    accent: 'bg-orange-500/15 text-orange-400',
  },
  loop: {
    icon: <Repeat className="h-2.5 w-2.5" />,
    paletteIcon: <Repeat className="h-4 w-4" />,
    accent: 'bg-cyan-500/15 text-cyan-400',
  },
  break: {
    icon: <CircleStop className="h-2.5 w-2.5" />,
    paletteIcon: <CircleStop className="h-4 w-4" />,
    accent: 'bg-red-500/15 text-red-400',
  },
  sub_workflow: {
    icon: <Workflow className="h-2.5 w-2.5" />,
    paletteIcon: <Workflow className="h-4 w-4" />,
    accent: 'bg-violet-500/15 text-violet-400',
  },
  race: {
    icon: <Zap className="h-2.5 w-2.5" />,
    paletteIcon: <Zap className="h-4 w-4" />,
    accent: 'bg-yellow-500/15 text-yellow-400',
  },
}

const defaultVisuals: NodeVisuals = {
  icon: <Puzzle className="h-2.5 w-2.5" />,
  paletteIcon: <Puzzle className="h-4 w-4" />,
  accent: 'bg-indigo-500/15 text-indigo-400',
}

export function getNodeVisuals(nodeId: string, iconUrl?: string): NodeVisuals {
  if (iconMap[nodeId]) return iconMap[nodeId]
  if (iconUrl) {
    return {
      icon: <img src={iconUrl} alt="" className="h-2.5 w-2.5 dark:invert" />,
      paletteIcon: <img src={iconUrl} alt="" className="h-4 w-4 dark:invert" />,
      accent: 'bg-gray-500/10 text-gray-400',
    }
  }
  return defaultVisuals
}
