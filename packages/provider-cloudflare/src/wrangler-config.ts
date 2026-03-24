export const WRANGLER_BASE_CONFIG = {
  compatibility_date: '2025-04-01',
  compatibility_flags: ['nodejs_compat'],
} as const

export interface WranglerWorkflowConfig {
  workerName: string
  className: string
  workflowName: string
  main: string
  vars?: Record<string, string>
}

export function generateWranglerConfig(config: WranglerWorkflowConfig): string {
  const wranglerConfig: Record<string, unknown> = {
    ...WRANGLER_BASE_CONFIG,
    name: config.workerName,
    main: config.main,
    workflows: [
      {
        binding: 'WORKFLOW',
        name: config.workflowName,
        class_name: config.className,
      },
    ],
  }
  if (config.vars && Object.keys(config.vars).length > 0) {
    wranglerConfig.vars = config.vars
  }
  return JSON.stringify(wranglerConfig, null, 2)
}
