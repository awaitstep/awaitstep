export default async function (ctx) {
  const email = ctx.env.JIRA_EMAIL
  const apiToken = ctx.env.JIRA_API_TOKEN
  const domain = ctx.config.domain
  if (typeof domain !== 'string' || !domain.endsWith('.atlassian.net')) {
    throw new Error(`Invalid Jira domain: "${domain}" — domain must end with .atlassian.net`)
  }
  const action = ctx.config.action

  async function jiraRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://${domain}/rest/api/3${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (method === 'POST' && response.status === 204) {
      return { success: true }
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errorMessages as string[] | undefined
      throw new Error(`Jira API error: ${errors?.[0] ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Issue': {
      const body: Record<string, unknown> = {
        fields: {
          project: { key: ctx.config.projectKey },
          issuetype: { name: ctx.config.issueType ?? 'Task' },
          summary: ctx.config.summary,
        },
      }
      const fields = body.fields as Record<string, unknown>
      if (ctx.config.description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: ctx.config.description }],
            },
          ],
        }
      }
      const data = await jiraRequest('POST', '/issue', body)
      return { id: data.id, key: data.key, data }
    }

    case 'Get Issue': {
      const data = await jiraRequest('GET', `/issue/${ctx.config.issueKey}`)
      return { id: data.id, key: data.key, data }
    }

    case 'Add Comment': {
      const data = await jiraRequest('POST', `/issue/${ctx.config.issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: ctx.config.commentBody }],
            },
          ],
        },
      })
      return { id: data.id, key: ctx.config.issueKey, data }
    }

    case 'Transition Issue': {
      const data = await jiraRequest('POST', `/issue/${ctx.config.issueKey}/transitions`, {
        transition: { id: ctx.config.transitionId },
      })
      return { id: null, key: ctx.config.issueKey, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
