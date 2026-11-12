export default async function (ctx) {
  const email = ctx.env.JIRA_EMAIL
  const apiToken = ctx.env.JIRA_API_TOKEN
  const domain = ctx.config.domain
  if (typeof domain !== 'string' || !domain.endsWith('.atlassian.net')) {
    throw new Error(`Invalid Jira domain: "${domain}" — domain must end with .atlassian.net`)
  }
  const action = ctx.config.action

  function adf(text: unknown) {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: String(text ?? '') }],
        },
      ],
    }
  }

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
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errorMessages as string[] | undefined
      throw new Error(`Jira API error: ${errors?.[0] ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Issue': {
      if (!ctx.config.projectKey) throw new Error('Project Key is required for Create Issue')
      if (!ctx.config.summary) throw new Error('Summary is required for Create Issue')
      const fields: Record<string, unknown> = {
        project: { key: ctx.config.projectKey },
        issuetype: { name: ctx.config.issueType ?? 'Task' },
        summary: ctx.config.summary,
      }
      if (ctx.config.description) fields.description = adf(ctx.config.description)
      const data = await jiraRequest('POST', '/issue', { fields })
      return { id: data.id, key: data.key, data }
    }

    case 'Get Issue': {
      if (!ctx.config.issueKey) throw new Error('Issue Key is required for Get Issue')
      const data = await jiraRequest('GET', `/issue/${ctx.config.issueKey}`)
      return { id: data.id, key: data.key, data }
    }

    case 'Add Comment': {
      if (!ctx.config.issueKey) throw new Error('Issue Key is required for Add Comment')
      const data = await jiraRequest('POST', `/issue/${ctx.config.issueKey}/comment`, {
        body: adf(ctx.config.commentBody),
      })
      return { id: data.id, key: ctx.config.issueKey, data }
    }

    case 'Transition Issue': {
      if (!ctx.config.issueKey) throw new Error('Issue Key is required for Transition Issue')
      const data = await jiraRequest('POST', `/issue/${ctx.config.issueKey}/transitions`, {
        transition: { id: ctx.config.transitionId },
      })
      return { id: null, key: ctx.config.issueKey, data }
    }

    case 'Update Issue': {
      if (!ctx.config.issueKey) throw new Error('Issue Key is required for Update Issue')
      const fields: Record<string, unknown> = {}
      if (ctx.config.summary) fields.summary = ctx.config.summary
      if (ctx.config.description) fields.description = adf(ctx.config.description)
      const data = await jiraRequest('PUT', `/issue/${ctx.config.issueKey}`, { fields })
      return { id: String(ctx.config.issueKey), key: String(ctx.config.issueKey), data }
    }

    case 'Delete Issue': {
      if (!ctx.config.issueKey) throw new Error('Issue Key is required for Delete Issue')
      const data = await jiraRequest('DELETE', `/issue/${ctx.config.issueKey}`)
      return { id: String(ctx.config.issueKey), key: String(ctx.config.issueKey), data }
    }

    case 'Search Issues': {
      const data = await jiraRequest('POST', '/search/jql', {
        jql: ctx.config.jql,
        maxResults: ctx.config.maxResults ?? 50,
        fields: ['summary', 'status', 'assignee', 'priority'],
      })
      return { id: null, key: '', data }
    }

    case 'List Projects': {
      const data = await jiraRequest('GET', '/project')
      return { id: null, key: '', data: { items: data } }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
