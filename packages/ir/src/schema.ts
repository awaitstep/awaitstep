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

const baseNodeSchema = z.object({
  id: nodeIdSchema,
  name: z.string().min(1).max(256),
  position: positionSchema,
})

const stepNodeSchema = baseNodeSchema.extend({
  type: z.literal('step'),
  code: z.string().min(1),
  config: stepConfigSchema.optional(),
})

const sleepNodeSchema = baseNodeSchema.extend({
  type: z.literal('sleep'),
  duration: z.union([z.number().min(0), z.string()]),
})

const sleepUntilNodeSchema = baseNodeSchema.extend({
  type: z.literal('sleep-until'),
  timestamp: z.string(),
})

const branchConditionSchema = z.object({
  label: z.string().min(1),
  condition: z.string(),
})

const branchNodeSchema = baseNodeSchema.extend({
  type: z.literal('branch'),
  branches: z.array(branchConditionSchema).min(2),
})

const parallelNodeSchema = baseNodeSchema.extend({
  type: z.literal('parallel'),
})

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

const httpRequestNodeSchema = baseNodeSchema.extend({
  type: z.literal('http-request'),
  url: z.string().min(1),
  method: httpMethodSchema,
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  config: stepConfigSchema.optional(),
})

const eventTypePattern = /^[a-zA-Z0-9_-]+$/

const waitForEventNodeSchema = baseNodeSchema.extend({
  type: z.literal('wait-for-event'),
  eventType: z.string().min(1).max(100).regex(eventTypePattern, {
    error: 'Event type must be alphanumeric with hyphens and underscores only',
  }),
  timeout: z.union([z.number().min(0), z.string()]).optional(),
})

export const workflowNodeSchema = z.discriminatedUnion('type', [
  stepNodeSchema,
  sleepNodeSchema,
  sleepUntilNodeSchema,
  branchNodeSchema,
  parallelNodeSchema,
  httpRequestNodeSchema,
  waitForEventNodeSchema,
])

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

export const workflowIRSchema = z.object({
  metadata: workflowMetadataSchema,
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(edgeSchema),
  entryNodeId: nodeIdSchema,
})
