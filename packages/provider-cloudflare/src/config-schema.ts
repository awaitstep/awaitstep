import { z } from 'zod'
import type { DeploymentConfigUiSchema } from '@awaitstep/codegen'

export const cloudflareRouteSchema = z.object({
  pattern: z.string().min(1),
  zoneName: z.string().min(1),
})

export const cloudflareDeploymentConfigSchema = z
  .object({
    routes: z.array(cloudflareRouteSchema).optional(),
    workersDev: z.boolean().optional(),
    previewUrls: z.boolean().optional(),
    triggerCode: z.string().optional(),
  })
  .strict()

export type CloudflareRoute = z.infer<typeof cloudflareRouteSchema>
export type CloudflareDeploymentConfig = z.infer<typeof cloudflareDeploymentConfigSchema>

export const cloudflareDefaultDeploymentConfig: CloudflareDeploymentConfig = {
  workersDev: true,
  previewUrls: true,
}

export const cloudflareDeploymentConfigUiSchema: DeploymentConfigUiSchema = {
  groups: [
    {
      title: 'Routing',
      description: 'Map HTTP requests to this worker.',
      fields: [
        {
          path: 'routes',
          label: 'Custom routes',
          widget: 'array-of-objects',
          help: 'Requires a Cloudflare zone attached to this account.',
        },
      ],
    },
    {
      title: 'Preview',
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
        },
      ],
    },
    {
      title: 'Advanced',
      fields: [
        {
          path: 'triggerCode',
          label: 'Trigger code override',
          widget: 'textarea',
          help: 'Replaces the default Workers entry-point wrapping this workflow.',
        },
      ],
    },
  ],
}
