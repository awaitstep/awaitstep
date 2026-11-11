import { z } from 'zod'
import type { DeploymentConfigUiSchema } from '@awaitstep/codegen'
import { DEFAULT_RETENTION } from './codegen/retention.js'

/**
 * A Cloudflare retention duration: milliseconds as a number, or a duration
 * string like "7 days" (same grammar as WorkflowSleepDuration).
 */
export const cloudflareRetentionDurationSchema = z.union([
  z.number().int().positive(),
  z
    .string()
    .trim()
    .regex(/^\d+\s+(second|minute|hour|day|week|month|year)s?$/i, {
      message: 'Use a duration like "7 days" or milliseconds as a number',
    }),
])

export const cloudflareRouteSchema = z.object({
  pattern: z.string().min(1),
  zoneName: z.string().min(1),
})

/**
 * Schema for one queue-consumer entry. Reused by both:
 * - `cloudflareDeploymentConfigSchema.queueConsumers` (per-deploy overrides)
 * - the inline `@config { ... }` block parser inside a `@queue function`
 *   handler body (which omits `queue` since it's derived from the function name)
 */
export const cloudflareQueueConsumerSchema = z
  .object({
    queue: z.string().min(1),
    maxBatchSize: z.number().int().min(1).max(100).optional(),
    maxBatchTimeout: z.number().int().min(0).max(60).optional(),
    maxRetries: z.number().int().min(0).max(100).optional(),
    deadLetterQueue: z.string().min(1).optional(),
    maxConcurrency: z.number().int().min(1).max(20).optional(),
  })
  .strict()

/** Same as above but without the `queue` field — used for inline `@config` blocks. */
export const cloudflareInlineQueueConfigSchema = cloudflareQueueConsumerSchema
  .omit({ queue: true })
  .strict()

export type CloudflareQueueConsumer = z.infer<typeof cloudflareQueueConsumerSchema>
export type CloudflareInlineQueueConfig = z.infer<typeof cloudflareInlineQueueConfigSchema>

/** One logical binding mapped to a physical resource for a deployment connection. */
export const cloudflareBindingMappingSchema = z
  .object({
    kind: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    resourceName: z.string().min(1).optional(),
  })
  .strict()

export type CloudflareBindingMapping = z.infer<typeof cloudflareBindingMappingSchema>

/** Logs and traces on — `true`'s form, and what an unset config deploys (WRANGLER_BASE_CONFIG). */
const OBSERVABILITY_ON = {
  enabled: false,
  head_sampling_rate: 1,
  logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true },
  traces: { enabled: true, persist: true, head_sampling_rate: 1 },
}

/** `false`'s form: everything off. */
const OBSERVABILITY_OFF = { enabled: false, logs: { enabled: false }, traces: { enabled: false } }

export const cloudflareDeploymentConfigSchema = z
  .object({
    // Routing
    routes: z.array(cloudflareRouteSchema).optional(),
    customDomains: z.array(z.string().min(1)).optional(),

    // Preview & access
    workersDev: z.boolean().optional(),
    previewUrls: z.boolean().optional(),

    // Compatibility
    compatibilityDate: z.string().optional(),
    compatibilityFlags: z.array(z.string()).optional(),

    // Scheduling
    cronTriggers: z.array(z.string().min(1)).optional(),

    // Logical binding name -> the physical resource for this connection.
    bindings: z.record(z.string(), cloudflareBindingMappingSchema).optional(),

    // Performance (boolean true → { mode: 'smart' } from UI toggle)
    placement: z
      .preprocess(
        (v) => (v === true ? { mode: 'smart' } : v === false ? undefined : v),
        z.object({ mode: z.enum(['smart', 'off']) }).optional(),
      )
      .optional(),
    limits: z
      .preprocess(
        (v) => (typeof v === 'number' ? { cpuMs: v } : v),
        z.object({ cpuMs: z.number().int().positive().optional() }).optional(),
      )
      .optional(),

    // Observability — the UI exposes a simple boolean toggle.
    //   true  → full logs + traces config (persist, invocation_logs, head_sampling_rate)
    //   false → everything disabled
    //   object → passed through as-is for advanced overrides
    // Unset is what the adapter deploys anyway (WRANGLER_BASE_CONFIG): logs
    // and traces on. The default says so, so a read config shows it as on.
    observability: z
      .preprocess(
        (v) => {
          if (v === true) return structuredClone(OBSERVABILITY_ON)
          if (v === false) return structuredClone(OBSERVABILITY_OFF)
          return v
        },
        z
          .object({
            enabled: z.boolean().optional(),
            head_sampling_rate: z.number().min(0).max(1).optional(),
            headSamplingRate: z.number().min(0).max(1).optional(),
            logs: z
              .object({
                enabled: z.boolean().optional(),
                head_sampling_rate: z.number().min(0).max(1).optional(),
                persist: z.boolean().optional(),
                invocation_logs: z.boolean().optional(),
              })
              .optional(),
            traces: z
              .object({
                enabled: z.boolean().optional(),
                persist: z.boolean().optional(),
                head_sampling_rate: z.number().min(0).max(1).optional(),
              })
              .optional(),
          })
          .optional(),
      )
      .default(() => structuredClone(OBSERVABILITY_ON)),
    logpush: z.boolean().optional(),

    // Per-queue consumer settings — populated automatically from `@queue function NAME(...)`
    // declarations in trigger code. Each entry tunes the consumer for one queue
    // name. Cloudflare defaults apply to fields left undefined.
    queueConsumers: z.array(cloudflareQueueConsumerSchema).optional(),

    // Instance retention — how long Cloudflare keeps instance state (step
    // outputs, status, errors) after a run ends. Stored state bills at
    // $0.20/GB-month past 1 GB, so AwaitStep applies a 7-day default when
    // unset instead of the account maximum (3 days Free / 30 days Paid).
    retention: z
      .object({
        successRetention: cloudflareRetentionDurationSchema.optional(),
        errorRetention: cloudflareRetentionDurationSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type CloudflareRoute = z.infer<typeof cloudflareRouteSchema>
export type CloudflareDeploymentConfig = z.infer<typeof cloudflareDeploymentConfigSchema>

/**
 * A workflow's worker serves no URL by default (D-9): its generated `fetch`
 * starts instances and reads their status for anyone who can reach it, and
 * AwaitStep triggers it through the Cloudflare API. Preview URLs are served on
 * workers.dev too. A function keeps both: it is called at its workers.dev URL.
 */
export const WORKFLOW_DEFAULT_ACCESS = { workersDev: false, previewUrls: false } as const

export const cloudflareDefaultDeploymentConfig: CloudflareDeploymentConfig = {
  workersDev: true,
  previewUrls: true,
  retention: { ...DEFAULT_RETENTION },
  // The same logs/traces config WRANGLER_BASE_CONFIG deploys when it is unset.
  observability: structuredClone(OBSERVABILITY_ON),
}

export const cloudflareDeploymentConfigUiSchema: DeploymentConfigUiSchema = {
  groups: [
    {
      title: 'Routing',
      fields: [
        {
          path: 'routes',
          label: 'Route patterns',
          widget: 'array-of-objects',
          help: 'Needs a Cloudflare zone. Public; calls here aren’t recorded',
          summaryLabel: 'Routes',
        },
        {
          path: 'customDomains',
          label: 'Custom domains',
          widget: 'array',
          placeholder: 'api.example.com',
          help: 'DNS and SSL handled for you. Public; calls here aren’t recorded',
          summaryLabel: 'Domains',
        },
      ],
    },
    {
      title: 'Preview & access',
      fields: [
        {
          path: 'workersDev',
          label: 'workers.dev subdomain',
          widget: 'boolean',
          help: 'Public at <name>.workers.dev; calls there aren’t recorded',
          summaryLabel: 'workers.dev',
        },
        {
          path: 'previewUrls',
          label: 'Preview URLs',
          widget: 'boolean',
          help: 'A unique URL per deployment',
          summaryLabel: 'Preview URLs',
        },
      ],
    },
    {
      title: 'Scheduling',
      fields: [
        {
          path: 'cronTriggers',
          label: 'Cron triggers',
          widget: 'array',
          placeholder: '0 */6 * * *',
          help: 'e.g. 0 */6 * * * for every 6 hours',
          summaryLabel: 'Cron',
        },
      ],
    },
    {
      title: 'Compatibility',
      fields: [
        {
          path: 'compatibilityDate',
          label: 'Compatibility date',
          widget: 'text',
          placeholder: '2025-04-01',
          help: 'The runtime behaviour to pin to',
          summaryLabel: 'Date',
        },
        {
          path: 'compatibilityFlags',
          label: 'Flags',
          widget: 'array',
          placeholder: 'nodejs_compat',
          help: 'Opt into runtime features',
          summaryLabel: 'Flags',
        },
      ],
    },
    {
      title: 'Performance',
      fields: [
        {
          path: 'placement',
          label: 'Smart Placement',
          widget: 'boolean',
          help: 'Run closer to your backend services',
          summaryLabel: 'Smart Placement',
        },
        {
          // The saved form is `{ cpuMs }`; the bare number the schema also takes reads back as that.
          path: 'limits.cpuMs',
          label: 'CPU limit (ms)',
          widget: 'number',
          help: 'Per invocation',
          summaryLabel: 'CPU ms',
        },
      ],
    },
    {
      title: 'Instance retention',
      description:
        'Stored state is billed past 1 GB, so AwaitStep caps this rather than using the account maximum.',
      fields: [
        {
          path: 'retention.successRetention',
          label: 'Successful runs',
          widget: 'text',
          placeholder: '7 days',
          help: 'How long step state is kept',
          summaryLabel: 'Success',
        },
        {
          path: 'retention.errorRetention',
          label: 'Failed runs',
          widget: 'text',
          placeholder: '7 days',
          help: 'Errored and terminated runs',
          summaryLabel: 'Failure',
        },
      ],
    },
    {
      title: 'Observability',
      fields: [
        {
          path: 'observability',
          label: 'Logs and traces',
          widget: 'boolean',
          help: 'Record what each invocation does',
          summaryLabel: 'Observability',
          // Mirrors the schema preprocess for `true` so sub-fields below display
          // the canonical defaults until the user overrides them, and so a
          // sub-field edit can materialize the parent without losing context.
          defaultObject: OBSERVABILITY_ON,
          // `false` is stored in this form; it reads back as off.
          offObject: OBSERVABILITY_OFF,
        },
        {
          path: 'observability.logs.enabled',
          label: 'Logs',
          widget: 'boolean',
          help: 'Console output and uncaught errors',
          summaryLabel: 'Logs',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.persist',
          label: 'Keep logs',
          widget: 'boolean',
          help: 'Searchable in the Cloudflare dashboard for 7 days',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.invocation_logs',
          label: 'Invocation events',
          widget: 'boolean',
          help: 'One event per request',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.head_sampling_rate',
          label: 'Sampling',
          widget: 'number',
          placeholder: '1',
          help: 'Share of invocations recorded, 0–1',
          summaryLabel: 'Sampling',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.head_sampling_rate',
          label: 'Logs sampling',
          widget: 'number',
          placeholder: '1',
          help: 'Overrides Sampling for logs',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.traces.head_sampling_rate',
          label: 'Traces sampling',
          widget: 'number',
          placeholder: '1',
          help: 'Overrides Sampling for traces',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'logpush',
          label: 'Logpush',
          widget: 'boolean',
          help: 'Forward logs to a Logpush destination',
          advanced: true,
        },
      ],
    },
  ],
}
