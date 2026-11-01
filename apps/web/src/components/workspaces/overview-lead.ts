import { plural } from '../../lib/plural'

// The line under a workspace's name on its Overview (`WsOverview`), per state.

export type OverviewState = 'empty' | 'quiet' | 'active'

export function overviewLead(facts: {
  state: OverviewState
  description: string | null
  people: number
  workflows: number
  functions: number
  projectName: string
  /** The project's first workspace, the one it was made with. */
  firstInProject: boolean
}): string {
  const canOpen = `${plural(facts.people, 'person', 'people')} can open`
  if (facts.state === 'active') {
    return [facts.description, `${canOpen} this workspace`].filter(Boolean).join(' · ')
  }
  let what = facts.description
  if (facts.state === 'quiet') {
    what = `${plural(facts.workflows, 'workflow')} and ${plural(facts.functions, 'function')}, none of them running yet`
  } else if (!what && facts.firstInProject) {
    what = `The workspace ${facts.projectName} started with`
  }
  return [what, `${canOpen} it`].filter(Boolean).join(' · ')
}
