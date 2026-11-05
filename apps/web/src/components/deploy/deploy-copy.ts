/** The line above the deploy form, by what is being deployed. */
export const DEPLOY_INTRO: Record<'workflow' | 'script', string> = {
  workflow: 'Configure and deploy to a provider connection.',
  script:
    'Deploys as a Worker you call with an HTTP POST. The response is the function’s return value.',
}
