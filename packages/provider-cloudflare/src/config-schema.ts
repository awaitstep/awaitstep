import { z } from 'zod'
import type { DeploymentConfigUiSchema } from '@awaitstep/codegen'

export const cloudflareRouteSchema = z.object({
  pattern: z.string().min(1),
  zoneName: z.string().min(1),
})

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

    // Observability (boolean true → { enabled: true } from UI toggle)
    observability: z
      .preprocess(
        (v) => (v === true ? { enabled: true } : v === false ? undefined : v),
        z
          .object({
            enabled: z.boolean(),
            headSamplingRate: z.number().min(0).max(1).optional(),
          })
          .optional(),
      )
      .optional(),
    logpush: z.boolean().optional(),

    // Advanced (hidden from UI)
    triggerCode: z.string().optional(),
  })
  .strict()

export type CloudflareRoute = z.infer<typeof cloudflareRouteSchema>
export type CloudflareDeploymentConfig = z.infer<typeof cloudflareDeploymentConfigSchema>

export const cloudflareDefaultDeploymentConfig: CloudflareDeploymentConfig = {
  workersDev: true,
  previewUrls: true,
  observability: { enabled: true },
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
          help: 'Send Workers Trace Events for logs and metrics.',
        },
        {
          path: 'logpush',
          label: 'Enable Logpush',
          widget: 'boolean',
          help: 'Push logs to a configured Logpush destination.',
        },
      ],
    },
  ],
}
