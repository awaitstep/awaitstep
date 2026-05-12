import { z } from 'zod'
import type { DeploymentConfigUiSchema } from '@awaitstep/codegen'

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
    // When undefined (not set) the adapter falls back to WRANGLER_BASE_CONFIG.observability.
    observability: z
      .preprocess(
        (v) => {
          if (v === true) {
            return {
              enabled: false,
              head_sampling_rate: 1,
              logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true },
              traces: { enabled: true, persist: true, head_sampling_rate: 1 },
            }
          }
          if (v === false) {
            return { enabled: false, logs: { enabled: false }, traces: { enabled: false } }
          }
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
      .optional(),
    logpush: z.boolean().optional(),

    // Per-queue consumer settings — populated automatically from `@queue function NAME(...)`
    // declarations in trigger code. Each entry tunes the consumer for one queue
    // name. Cloudflare defaults apply to fields left undefined.
    queueConsumers: z.array(cloudflareQueueConsumerSchema).optional(),
  })
  .strict()

export type CloudflareRoute = z.infer<typeof cloudflareRouteSchema>
export type CloudflareDeploymentConfig = z.infer<typeof cloudflareDeploymentConfigSchema>

export const cloudflareDefaultDeploymentConfig: CloudflareDeploymentConfig = {
  workersDev: true,
  previewUrls: true,
  // observability is intentionally omitted here — the full nested
  // logs/traces config comes from WRANGLER_BASE_CONFIG in wrangler-config.ts
}

export const cloudflareDeploymentConfigUiSchema: DeploymentConfigUiSchema = {
  groups: [
    {
      title: 'Routing',
      description: 'Control how traffic reaches this worker.',
      fields: [
        {
          path: 'routes',
          label: 'Route patterns',
          widget: 'array-of-objects',
          help: 'Map zone-based route patterns to this worker. Requires a Cloudflare zone.',
        },
        {
          path: 'customDomains',
          label: 'Custom domains',
          widget: 'array',
          help: 'Hostnames where this worker is the origin. DNS and SSL are managed automatically.',
        },
      ],
    },
    {
      title: 'Preview & Access',
      fields: [
        {
          path: 'workersDev',
          label: 'Enable workers.dev subdomain',
          widget: 'boolean',
          help: 'Expose this worker at <name>.workers.dev.',
        },
        {
          path: 'previewUrls',
          label: 'Enable preview URLs',
          widget: 'boolean',
          help: 'Generate unique preview URLs for each deployment.',
        },
      ],
    },
    {
      title: 'Scheduling',
      description: 'Run this workflow on a schedule.',
      fields: [
        {
          path: 'cronTriggers',
          label: 'Cron triggers',
          widget: 'array',
          help: 'Cron expressions (e.g. "0 */6 * * *" for every 6 hours).',
        },
      ],
    },
    {
      title: 'Compatibility',
      description: 'Workers runtime compatibility settings.',
      fields: [
        {
          path: 'compatibilityDate',
          label: 'Compatibility date',
          widget: 'text',
          placeholder: '2025-04-01',
          help: 'Date that determines which Workers runtime features are available.',
        },
        {
          path: 'compatibilityFlags',
          label: 'Compatibility flags',
          widget: 'array',
          help: 'Runtime flags (e.g. nodejs_compat). One per line.',
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
          help: 'Automatically run the worker closer to backend services for lower latency.',
        },
        {
          path: 'limits',
          label: 'CPU time limit (ms)',
          widget: 'number',
          help: 'Maximum CPU time per invocation in milliseconds.',
        },
      ],
    },
    {
      title: 'Observability',
      fields: [
        {
          path: 'observability',
          label: 'Enable observability',
          widget: 'boolean',
          help: 'Enable Workers Logs and Traces with persistence and full sampling (logs, traces, invocation events).',
          // Mirrors the schema preprocess for `true` so sub-fields below display
          // the canonical defaults until the user overrides them, and so a
          // sub-field edit can materialize the parent without losing context.
          defaultObject: {
            enabled: false,
            head_sampling_rate: 1,
            logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true },
            traces: { enabled: true, persist: true, head_sampling_rate: 1 },
          },
        },
        {
          path: 'observability.logs.enabled',
          label: 'Workers Logs',
          widget: 'boolean',
          help: 'Collect console output and uncaught errors from invocations.',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.persist',
          label: 'Persist logs',
          widget: 'boolean',
          help: 'Retain logs for 7 days for querying in the dashboard.',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.invocation_logs',
          label: 'Capture invocation events',
          widget: 'boolean',
          help: 'Record one event per invocation (request/response metadata).',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.head_sampling_rate',
          label: 'Sampling rate',
          widget: 'number',
          placeholder: '1',
          help: 'Fraction (0–1) of invocations sampled for both logs and traces unless overridden below.',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.logs.head_sampling_rate',
          label: 'Logs sampling rate',
          widget: 'number',
          placeholder: '1',
          help: 'Fraction (0–1) of invocations whose logs are kept. Overrides the top-level rate.',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'observability.traces.head_sampling_rate',
          label: 'Traces sampling rate',
          widget: 'number',
          placeholder: '1',
          help: 'Fraction (0–1) of invocations sampled for traces. Overrides the top-level rate.',
          visibleWhen: { path: 'observability', truthy: true },
        },
        {
          path: 'logpush',
          label: 'Enable Logpush',
          widget: 'boolean',
          help: 'Forward logs to an external Logpush destination (R2, Datadog, Splunk, …).',
          advanced: true,
        },
      ],
    },
  ],
}
