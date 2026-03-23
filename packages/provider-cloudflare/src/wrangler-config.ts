export interface WranglerWorkflowConfig {
  workerName: string
  className: string
  workflowName: string
  compatibilityDate: string
  main: string
  vars?: Record<string, string>
  nodeCompat?: boolean
}

export function generateWranglerConfig(config: WranglerWorkflowConfig): string {
  const wranglerConfig: Record<string, unknown> = {
    name: config.workerName,
    main: config.main,
    compatibility_date: config.compatibilityDate,
    workflows: [
      {
        binding: 'WORKFLOW',
        name: config.workflowName,
        class_name: config.className,
      },
    ],
  }
  if (config.nodeCompat) {
    wranglerConfig.compatibility_flags = ['nodejs_compat']
  }
  if (config.vars && Object.keys(config.vars).length > 0) {
    wranglerConfig.vars = config.vars
  }
  return JSON.stringify(wranglerConfig, null, 2)
}
