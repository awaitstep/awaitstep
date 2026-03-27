export default async function (ctx) {
  const apiKey = ctx.env.LINEAR_API_KEY
  const action = ctx.config.action

  async function linearRequest(query: string, variables?: Record<string, unknown>) {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`)
    }
    if (data.errors) {
      const errors = data.errors as Array<{ message: string }>
      throw new Error(`Linear GraphQL error: ${errors[0].message}`)
    }
    return data.data as Record<string, unknown>
  }

  switch (action) {
    case 'Create Issue': {
      const input: Record<string, unknown> = {
        teamId: ctx.config.teamId,
        title: ctx.config.title,
      }
      if (ctx.config.description) input.description = ctx.config.description
      if (ctx.config.priority != null) input.priority = ctx.config.priority
      if (ctx.config.assigneeId) input.assigneeId = ctx.config.assigneeId
      const data = await linearRequest(
        `mutation ($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { input },
      )
      const result = data.issueCreate as { issue: { id: string; identifier: string; url: string } }
      return { id: result.issue.id, identifier: result.issue.identifier, data }
    }

    case 'Get Issue': {
      const data = await linearRequest(
        `query ($id: String!) {
          issue(id: $id) {
            id identifier title description state { name } priority assignee { name } url
          }
        }`,
        { id: ctx.config.issueId },
      )
      const issue = data.issue as { id: string; identifier: string }
      return { id: issue.id, identifier: issue.identifier, data }
    }

    case 'Update Issue': {
      const input: Record<string, unknown> = {}
      if (ctx.config.title) input.title = ctx.config.title
      if (ctx.config.description) input.description = ctx.config.description
      if (ctx.config.stateId) input.stateId = ctx.config.stateId
      if (ctx.config.priority != null) input.priority = ctx.config.priority
      if (ctx.config.assigneeId) input.assigneeId = ctx.config.assigneeId
      const data = await linearRequest(
        `mutation ($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { id: ctx.config.issueId, input },
      )
      const result = data.issueUpdate as { issue: { id: string; identifier: string } }
      return { id: result.issue.id, identifier: result.issue.identifier, data }
    }

    case 'List Issues': {
      const filter: Record<string, unknown> = {}
      if (ctx.config.teamId) filter.team = { id: { eq: ctx.config.teamId } }
      const data = await linearRequest(
        `query ($filter: IssueFilter) {
          issues(filter: $filter, first: 50) {
            nodes { id identifier title state { name } priority assignee { name } url }
          }
        }`,
        { filter },
      )
      return { id: null, identifier: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
