export interface WranglerWorkflowConfig {
  workerName: string
  className: string
  workflowName: string
  compatibilityDate: string
  main: string
}

export function generateWranglerConfig(config: WranglerWorkflowConfig): string {
  const wranglerConfig = {
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
  return JSON.stringify(wranglerConfig, null, 2)
}
