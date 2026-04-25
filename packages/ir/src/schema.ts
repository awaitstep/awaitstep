import { z } from 'zod'

const retryBackoffSchema = z.enum(['constant', 'linear', 'exponential'])

const retryConfigSchema = z.object({
  limit: z.number().int().min(0),
  delay: z.union([z.number().min(0), z.string()]),
  backoff: retryBackoffSchema.optional(),
})

const stepConfigSchema = z.object({
  retries: retryConfigSchema.optional(),
  timeout: z.union([z.number().min(0), z.string()]).optional(),
})

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const nodeIdSchema = z.string().min(1)

export const workflowNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.string().min(1),
  name: z.string().min(1).max(256),
  position: positionSchema,
  version: z.string().min(1),
  provider: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  config: stepConfigSchema.optional(),
})

export const edgeSchema = z.object({
  id: z.string().min(1),
  source: nodeIdSchema,
  target: nodeIdSchema,
  label: z.string().optional(),
})

export const workflowMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const httpTriggerSchema = z.object({
  type: z.literal('http'),
  path: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
})

const cronTriggerSchema = z.object({
  type: z.literal('cron'),
  expression: z.string().min(1),
})

const eventTypePattern = /^[a-zA-Z0-9_-]+$/

const eventTriggerSchema = z.object({
  type: z.literal('event'),
  eventType: z.string().min(1).max(100).regex(eventTypePattern, {
    error: 'Event type must be alphanumeric with hyphens and underscores only',
  }),
})

const manualTriggerSchema = z.object({
  type: z.literal('manual'),
})

export const triggerConfigSchema = z.discriminatedUnion('type', [
  httpTriggerSchema,
  cronTriggerSchema,
  eventTriggerSchema,
  manualTriggerSchema,
])

export const workflowIRSchema = z.object({
  kind: z.literal('workflow').optional(),
  metadata: workflowMetadataSchema,
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(edgeSchema),
  entryNodeId: nodeIdSchema,
  trigger: triggerConfigSchema.optional(),
})

export const scriptIRSchema = workflowIRSchema.extend({
  kind: z.literal('script'),
  trigger: httpTriggerSchema,
})

export const artifactIRSchema = z.discriminatedUnion('kind', [
  scriptIRSchema,
  // workflowIRSchema's kind is optional, so we wrap with a strict-kind variant
  // so the discriminated union has a fully literal discriminator on each arm.
  workflowIRSchema.extend({ kind: z.literal('workflow') }),
])
