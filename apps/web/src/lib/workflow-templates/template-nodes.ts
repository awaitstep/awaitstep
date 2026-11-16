import type { Edge, StepConfig, WorkflowIR, WorkflowNode } from '@awaitstep/ir'

/**
 * The registry nodes templates use, at the version each template pins. A
 * template loads even when the org hasn't installed them; the canvas then
 * says which to install.
 */
export const REGISTRY_NODES = {
  resend: { name: 'Resend', version: '1.1.0' },
  slack: { name: 'Slack', version: '1.1.0' },
} as const

export type RegistryNodeType = keyof typeof REGISTRY_NODES

type At = readonly [x: number, y: number]

const CREATED_AT = '2026-01-01T00:00:00Z'

function node(
  type: string,
  id: string,
  [x, y]: At,
  data: Record<string, unknown>,
  version = '1.0.0',
): WorkflowNode {
  return { id, type, name: id, position: { x, y }, version, data }
}

/** A template's IR; the first node is the entry. */
export function workflow(
  name: string,
  description: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): WorkflowIR {
  return {
    metadata: { name, description, version: 1, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    entryNodeId: nodes[0]!.id,
    nodes,
    edges,
  }
}

/** A step running `code`; `settings` are the node's other fields, e.g. `{ retryLimit: 0 }`. */
export function step(
  id: string,
  at: At,
  code: string,
  settings: Record<string, unknown> = {},
): WorkflowNode {
  return node('step', id, at, { code, ...settings })
}

export function sleep(id: string, at: At, duration: string): WorkflowNode {
  return node('sleep', id, at, { duration })
}

export function branch(
  id: string,
  at: At,
  branches: { label: string; condition: string }[],
): WorkflowNode {
  return node('branch', id, at, { branches })
}

export function parallel(id: string, at: At): WorkflowNode {
  return node('parallel', id, at, {})
}

export function tryCatch(id: string, at: At): WorkflowNode {
  return node('try_catch', id, at, {})
}

export function loopEach(id: string, at: At, collection: string, itemVar: string): WorkflowNode {
  return node('loop', id, at, { loopType: 'forEach', collection, itemVar })
}

interface WaitArms {
  eventType: string
  timeout: string
  onEvent: string
  onTimeout: string
}

/** A wait whose arms are stored both as fields and as labelled edges (see `waitEdges`). */
export function waitForEvent(id: string, at: At, arms: WaitArms): WorkflowNode {
  return node('wait_for_event', id, at, {
    eventType: arms.eventType,
    timeout: arms.timeout,
    onEventNode: arms.onEvent,
    onTimeoutNode: arms.onTimeout,
  })
}

export function http(
  id: string,
  at: At,
  data: Record<string, unknown>,
  config?: StepConfig,
): WorkflowNode {
  return { ...node('http_request', id, at, data), ...(config && { config }) }
}

export function registryNode(
  type: RegistryNodeType,
  id: string,
  at: At,
  data: Record<string, unknown>,
): WorkflowNode {
  return node(type, id, at, data, REGISTRY_NODES[type].version)
}

export function sendEmail(
  id: string,
  at: At,
  email: { to: string; subject: string; html: string },
): WorkflowNode {
  return registryNode('resend', id, at, {
    action: 'Send Email',
    from: 'you@example.com',
    ...email,
  })
}

export function slackMessage(id: string, at: At, channel: string, text: string): WorkflowNode {
  return registryNode('slack', id, at, { action: 'Send Message', channel, text })
}

export function edge(source: string, target: string, label?: string): Edge {
  return {
    id: label ? `${source}-${label}-${target}` : `${source}-${target}`,
    source,
    target,
    ...(label !== undefined && { label }),
  }
}

/** The two edges of a wait's arms, matching the fields `waitForEvent` set. */
export function waitEdges(wait: WorkflowNode): Edge[] {
  return [
    edge(wait.id, String(wait.data.onEventNode), 'onEvent'),
    edge(wait.id, String(wait.data.onTimeoutNode), 'onTimeout'),
  ]
}
