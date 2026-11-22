/** A node's run state. */
export type NodeStatus =
  'idle' | 'running' | 'waiting' | 'sleeping' | 'failed' | 'retrying' | 'done' | 'skipped'

export interface NodeFrame {
  status: NodeStatus
  /** 0 to 1 through the current status (the clock sweep, the retry bounce). */
  progress: number
  attempt: number
}

export interface EdgeFrame {
  /** 0 to 1: how much of the edge is drawn. */
  drawn: number
  /** Where a run pulse sits on the edge (0 to 1), or null when none travels it. */
  pulse: number | null
}

/** One moment of a run: every node's state and every edge's. */
export interface RunFrame {
  nodes: Record<string, NodeFrame>
  edges: Record<string, EdgeFrame>
}

/** One status a node holds over a stretch of time, in seconds from the start of a run. */
export interface Span {
  status: NodeStatus
  from: number
  to: number
  attempt?: number
}

/** Seconds a run pulse spends travelling into its target before the target starts. */
const PULSE_LEAD = 0.35

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const window01 = (t: number, from: number, to: number) => clamp01((t - from) / (to - from))

/**
 * A node's state `r` seconds into a run, from its spans. Before its first span it is idle,
 * after its last it is done; a node with no spans is one the run skipped.
 */
export function spanFrame(spans: Span[] | undefined, r: number): NodeFrame {
  if (!spans || spans.length === 0) return { status: 'skipped', progress: 0, attempt: 0 }
  for (const s of spans) {
    if (r >= s.from && r < s.to)
      return { status: s.status, progress: window01(r, s.from, s.to), attempt: s.attempt ?? 1 }
  }
  const last = spans[spans.length - 1]
  if (r >= last.to) return { status: 'done', progress: 1, attempt: last.attempt ?? 1 }
  return { status: 'idle', progress: 0, attempt: 0 }
}

/**
 * The run pulse on an edge: it leaves when the source finishes (or just before the target
 * starts, whichever is first) and lands as the target starts. A source that ends failed or
 * skipped sends nothing, and nothing travels into a branch arm the run does not take.
 */
export function edgePulse(
  from: Span[] | undefined,
  to: Span[] | undefined,
  r: number,
): number | null {
  if (!from?.length || !to?.length) return null
  const ended = from[from.length - 1]
  if (ended.status === 'failed' || ended.status === 'skipped' || to[0].status === 'skipped')
    return null
  const arrive = to[0].from
  const start = Math.min(ended.to, arrive - PULSE_LEAD)
  return r >= start && r < arrive ? window01(r, start, arrive) : null
}
