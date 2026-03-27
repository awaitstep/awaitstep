export default async function (ctx) {
  const token = ctx.env.GITHUB_TOKEN
  const action = ctx.config.action

  async function githubRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`GitHub API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Issue': {
      const body: Record<string, unknown> = {
        title: ctx.config.title,
      }
      if (ctx.config.body) body.body = ctx.config.body
      if (ctx.config.labels) {
        body.labels =
          typeof ctx.config.labels === 'string' ? JSON.parse(ctx.config.labels) : ctx.config.labels
      }
      if (ctx.config.assignees) {
        body.assignees =
          typeof ctx.config.assignees === 'string'
            ? JSON.parse(ctx.config.assignees)
            : ctx.config.assignees
      }
      const data = await githubRequest(
        'POST',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/issues`,
        body,
      )
      return { id: data.number, url: data.html_url, data }
    }

    case 'Get Issue': {
      const data = await githubRequest(
        'GET',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/issues/${ctx.config.issueNumber}`,
      )
      return { id: data.number, url: data.html_url, data }
    }

    case 'Create Comment': {
      const data = await githubRequest(
        'POST',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/issues/${ctx.config.issueNumber}/comments`,
        {
          body: ctx.config.commentBody,
        },
      )
      return { id: data.id, url: data.html_url, data }
    }

    case 'List Repo Issues': {
      const params = new URLSearchParams()
      if (ctx.config.state) params.set('state', ctx.config.state)
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await githubRequest(
        'GET',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/issues${query}`,
      )
      return { id: null, url: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
