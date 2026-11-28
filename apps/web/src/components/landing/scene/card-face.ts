import type { SceneNode, SceneNodeKind } from './graph.js'
import type { NodeStatus } from './timeline.js'

/**
 * A canvas node's face, in its own pixel space: the icon tile tinted by kind, the name, and
 * the detail row under a hairline, like `NodeBase` in the dashboard. The SVG poster and the
 * card textures both draw from these numbers.
 */
export const FACE = {
  width: 240,
  height: 80,
  radius: 8,
  tile: { x: 12, y: 10, size: 24, radius: 5, icon: 16 },
  /** `chars`: the longest text that fits before it is clipped with an ellipsis. */
  name: { x: 46, y: 29, size: 17, weight: 600, chars: 20 },
  rule: { y: 44 },
  detail: { x: 12, y: 66, size: 13, chars: 30 },
} as const

/** The token each node kind takes its colour from (`--node-*` in the dashboard). */
export const KIND_TOKENS: Record<SceneNodeKind, string> = {
  step: '--kind-step',
  sleep: '--kind-sleep',
  branch: '--kind-branch',
  parallel: '--kind-parallel',
  http_request: '--kind-http',
  wait_for_event: '--kind-event',
  try_catch: '--kind-try',
  race: '--kind-race',
}

/** The token each run state paints a card's outline and status line with. */
export const STATUS_TOKENS: Partial<Record<NodeStatus, string>> = {
  running: '--run-running',
  waiting: '--run-waiting',
  sleeping: '--run-sleeping',
  failed: '--run-failed',
  retrying: '--run-retrying',
  done: '--run-done',
}

/** What the detail row says while a run is on the node; otherwise the node's own detail. */
export function statusLine(
  node: SceneNode,
  status: NodeStatus,
  attempt: number,
): string | undefined {
  switch (status) {
    case 'running':
      return attempt > 1 ? `Running, attempt ${attempt}` : 'Running'
    case 'waiting':
      return 'Waiting for the event'
    case 'sleeping':
      return `Sleeping ${node.detail ?? ''}`.trim()
    case 'failed':
      return node.failure
        ? `Attempt ${attempt} failed: ${node.failure}`
        : `Attempt ${attempt} failed`
    case 'retrying':
      return `Retrying, attempt ${attempt}`
    case 'done':
      return attempt > 1 ? `Complete after ${attempt} attempts` : 'Complete'
    case 'skipped':
      return 'Not taken'
    default:
      return node.detail
  }
}

/** Shortens `text` to fit `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
