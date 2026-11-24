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
  Send,
} from 'lucide-react'

export interface NodeVisuals {
  icon: React.ReactNode
  paletteIcon: React.ReactNode
  accent: string
  /** The kind's colour as a fill, for the rail down a canvas node's left edge. */
  rail: string
}

const iconMap: Record<string, NodeVisuals> = {
  step: {
    icon: <Code className="h-2.5 w-2.5" />,
    paletteIcon: <Code className="h-4 w-4" />,
    accent: 'bg-node-code/15 text-node-code',
    rail: 'bg-node-code',
  },
  sleep: {
    icon: <Clock className="h-2.5 w-2.5" />,
    paletteIcon: <Clock className="h-4 w-4" />,
    accent: 'bg-node-timing/15 text-node-timing',
    rail: 'bg-node-timing',
  },
  sleep_until: {
    icon: <CalendarClock className="h-2.5 w-2.5" />,
    paletteIcon: <CalendarClock className="h-4 w-4" />,
    accent: 'bg-node-timing/15 text-node-timing',
    rail: 'bg-node-timing',
  },
  branch: {
    icon: <GitBranch className="h-2.5 w-2.5" />,
    paletteIcon: <GitBranch className="h-4 w-4" />,
    accent: 'bg-node-flow/15 text-node-flow',
    rail: 'bg-node-flow',
  },
  parallel: {
    icon: <Layers className="h-2.5 w-2.5" />,
    paletteIcon: <Layers className="h-4 w-4" />,
    accent: 'bg-node-parallel/15 text-node-parallel',
    rail: 'bg-node-parallel',
  },
  http_request: {
    icon: <Globe className="h-2.5 w-2.5" />,
    paletteIcon: <Globe className="h-4 w-4" />,
    accent: 'bg-node-network/15 text-node-network',
    rail: 'bg-node-network',
  },
  wait_for_event: {
    icon: <Bell className="h-2.5 w-2.5" />,
    paletteIcon: <Bell className="h-4 w-4" />,
    accent: 'bg-node-event/15 text-node-event',
    rail: 'bg-node-event',
  },
  try_catch: {
    icon: <ShieldAlert className="h-2.5 w-2.5" />,
    paletteIcon: <ShieldAlert className="h-4 w-4" />,
    accent: 'bg-node-error-handling/15 text-node-error-handling',
    rail: 'bg-node-error-handling',
  },
  loop: {
    icon: <Repeat className="h-2.5 w-2.5" />,
    paletteIcon: <Repeat className="h-4 w-4" />,
    accent: 'bg-node-loop/15 text-node-loop',
    rail: 'bg-node-loop',
  },
  break: {
    icon: <CircleStop className="h-2.5 w-2.5" />,
    paletteIcon: <CircleStop className="h-4 w-4" />,
    accent: 'bg-node-break/15 text-node-break',
    rail: 'bg-node-break',
  },
  sub_workflow: {
    icon: <Workflow className="h-2.5 w-2.5" />,
    paletteIcon: <Workflow className="h-4 w-4" />,
    accent: 'bg-node-sub/15 text-node-sub',
    rail: 'bg-node-sub',
  },
  sub_script: {
    icon: <Send className="h-2.5 w-2.5" />,
    paletteIcon: <Send className="h-4 w-4" />,
    accent: 'bg-node-sub/15 text-node-sub',
    rail: 'bg-node-sub',
  },
  race: {
    icon: <Zap className="h-2.5 w-2.5" />,
    paletteIcon: <Zap className="h-4 w-4" />,
    accent: 'bg-node-race/15 text-node-race',
    rail: 'bg-node-race',
  },
}

const defaultVisuals: NodeVisuals = {
  icon: <Puzzle className="h-2.5 w-2.5" />,
  paletteIcon: <Puzzle className="h-4 w-4" />,
  accent: 'bg-node-default/15 text-node-default',
  rail: 'bg-node-default',
}

export function getNodeVisuals(nodeId: string, iconUrl?: string): NodeVisuals {
  // A node type is IR-controlled; `__proto__` must not resolve to Object.prototype.
  if (Object.hasOwn(iconMap, nodeId)) return iconMap[nodeId]!
  if (iconUrl) {
    return {
      icon: (
        <img
          src={iconUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-2.5 w-2.5 dark:invert"
        />
      ),
      paletteIcon: (
        <img src={iconUrl} alt="" referrerPolicy="no-referrer" className="h-4 w-4 dark:invert" />
      ),
      accent: 'bg-node-custom/10 text-node-custom',
      rail: 'bg-node-custom',
    }
  }
  return defaultVisuals
}
