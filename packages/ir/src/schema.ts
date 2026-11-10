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

// Node ids end up in selectors, file names and generated labels, so control
// characters and line breaks (C0, DEL, C1, U+2028/2029) are refused. Any other
// text stays valid. This schema is enforced wherever an IR is loaded or
// validated: saving a version, deploying, and the API's source read all refuse
// an IR whose node id has a control character, with a 400. A row stored before
// the rule therefore cannot be saved, deployed or have its source read.
// Only the dashboard canvas still opens such a row (it falls back to a
// lenient read), so the id can be renamed there.
// eslint-disable-next-line no-control-regex -- the control range is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const nodeIdSchema = z
  .string()
  .min(1)
  .refine((id) => !CONTROL_CHARACTERS.test(id), 'Node ids cannot contain control characters')

// ── Per-builtin data schemas ──
// Deliberately lenient: every field optional, unknown keys allowed, and
// primitives widened where stored workflows are known to vary (durations may
// be string or number; enum-ish fields are plain strings because generators
// coerce). Stored v1 workflows predate any data validation, so these schemas
// must accept everything that ever saved. Strict, user-facing checks are
// collected by validateNodeData (validate.ts) instead of failing the parse.

const durationValueSchema = z.union([z.string(), z.number()])
// Header/query values are emitted through toJsLiteral, which accepts any JSON
// value — stored workflows with non-string values work today, so stay open.
const openRecordSchema = z.record(z.string(), z.unknown())

const stepNodeDataSchema = z
  .object({
    code: z.string().optional(),
    inline: z.boolean().optional(),
    export: z.boolean().optional(),
    exportAs: z.string().optional(),
    retryLimit: z.number().optional(),
    retryDelay: z.string().optional(),
    backoff: z.string().optional(),
    timeout: z.string().optional(),
  })
  .catchall(z.unknown())

const sleepNodeDataSchema = z
  .object({ duration: durationValueSchema.optional() })
  .catchall(z.unknown())

const sleepUntilNodeDataSchema = z
  .object({ timestamp: z.string().optional() })
  .catchall(z.unknown())

const branchNodeDataSchema = z
  .object({
    branches: z
      .array(z.object({ label: z.string(), condition: z.string() }).catchall(z.unknown()))
      .optional(),
  })
  .catchall(z.unknown())

const httpRequestNodeDataSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
    url: z.string().optional(),
    headers: openRecordSchema.optional(),
    queryParams: openRecordSchema.optional(),
    body: z.string().optional(),
    retryLimit: z.number().optional(),
    timeout: z.string().optional(),
    durable: z.boolean().optional(),
    export: z.boolean().optional(),
    exportAs: z.string().optional(),
    params: openRecordSchema.optional(),
  })
  .catchall(z.unknown())

const waitForEventNodeDataSchema = z
  .object({
    eventType: z.string().optional(),
    timeout: durationValueSchema.optional(),
    onEventNode: z.string().optional(),
    onTimeoutNode: z.string().optional(),
  })
  .catchall(z.unknown())

const loopNodeDataSchema = z
  .object({
    loopType: z.string().optional(),
    collection: z.string().optional(),
    itemVar: z.string().optional(),
    indexVar: z.string().optional(),
    condition: z.string().optional(),
    count: z.number().optional(),
  })
  .catchall(z.unknown())

const breakNodeDataSchema = z.object({ condition: z.string().optional() }).catchall(z.unknown())

const subWorkflowNodeDataSchema = z
  .object({
    workflowId: z.string().optional(),
    workflowName: z.string().optional(),
    input: z.string().optional(),
    waitForCompletion: z.boolean().optional(),
    timeout: z.string().optional(),
    export: z.boolean().optional(),
    exportAs: z.string().optional(),
    params: openRecordSchema.optional(),
  })
  .catchall(z.unknown())

const subScriptNodeDataSchema = z
  .object({
    scriptId: z.string().optional(),
    workerName: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
    url: z.string().optional(),
    headers: openRecordSchema.optional(),
    body: z.string().optional(),
    retryLimit: z.number().optional(),
    timeout: z.string().optional(),
    export: z.boolean().optional(),
    exportAs: z.string().optional(),
    params: openRecordSchema.optional(),
  })
  .catchall(z.unknown())

/**
 * Data schema per builtin node type. Not wired into workflowNodeSchema — the
 * node-level parse stays type-agnostic so custom nodes and legacy rows never
 * fail; validateNodeData applies these per type and collects the issues.
 */
export const builtinNodeDataSchemas = {
  step: stepNodeDataSchema,
  sleep: sleepNodeDataSchema,
  sleep_until: sleepUntilNodeDataSchema,
  branch: branchNodeDataSchema,
  parallel: openRecordSchema,
  http_request: httpRequestNodeDataSchema,
  wait_for_event: waitForEventNodeDataSchema,
  try_catch: openRecordSchema,
  loop: loopNodeDataSchema,
  break: breakNodeDataSchema,
  sub_workflow: subWorkflowNodeDataSchema,
  sub_script: subScriptNodeDataSchema,
  race: openRecordSchema,
} as const

export const workflowNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.string().min(1),
  name: z.string().min(1).max(256),
  position: positionSchema.optional(),
  version: z.string().min(1),
  provider: z.string().min(1).optional(),
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

const envDeclarationSchema = z
  .object({
    name: z.string().min(1),
    required: z.boolean().optional(),
    secret: z.boolean().optional(),
    description: z.string().optional(),
  })
  .catchall(z.unknown())

const resourceDeclarationSchema = z
  .object({
    name: z.string().min(1),
    kind: z.string().min(1),
    provider: z.string().min(1).optional(),
    resourceId: z.string().optional(),
    resourceName: z.string().optional(),
  })
  .catchall(z.unknown())

const projectFileSchema = z.object({
  path: z.string(),
  source: z.string(),
})

export const workflowRuntimeSchema = z
  .object({
    provider: z.string().min(1).optional(),
    triggerCode: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    env: z.array(envDeclarationSchema).optional(),
    resources: z.array(resourceDeclarationSchema).optional(),
    files: z.array(projectFileSchema).optional(),
  })
  .catchall(z.unknown())

export const workflowIRSchema = z.object({
  kind: z.literal('workflow').optional(),
  // Absent on v1 documents — see migrate.ts.
  irVersion: z.literal(3).optional(),
  metadata: workflowMetadataSchema,
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(edgeSchema),
  entryNodeId: nodeIdSchema,
  runtime: workflowRuntimeSchema.optional(),
})

export const scriptIRSchema = workflowIRSchema.extend({
  kind: z.literal('script'),
})

// Plain union (not discriminated) so legacy workflow IRs persisted without a
// `kind` field still validate. zod tries each arm in order — script IRs match
// scriptIRSchema (literal `kind: 'script'` is required), everything else falls
// through to workflowIRSchema where `kind` is optional.
export const artifactIRSchema = z.union([scriptIRSchema, workflowIRSchema])
