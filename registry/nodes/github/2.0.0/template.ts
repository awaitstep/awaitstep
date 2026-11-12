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

  function parseJsonArray(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error('Invalid JSON array')
    }
  }

  switch (action) {
    case 'Create Issue': {
      const body: Record<string, unknown> = { title: ctx.config.title }
      if (ctx.config.body) body.body = ctx.config.body
      if (ctx.config.labels) body.labels = parseJsonArray(ctx.config.labels)
      if (ctx.config.assignees) body.assignees = parseJsonArray(ctx.config.assignees)
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
        { body: ctx.config.commentBody },
      )
      return { id: data.id, url: data.html_url, data }
    }

    case 'List Repo Issues': {
      const params = new URLSearchParams()
      if (ctx.config.state) params.set('state', String(ctx.config.state))
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await githubRequest(
        'GET',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/issues${query}`,
      )
      return { id: null, url: null, data: { items: data } }
    }

    case 'Create Pull Request': {
      const data = await githubRequest(
        'POST',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/pulls`,
        {
          title: ctx.config.title,
          body: ctx.config.body,
          head: ctx.config.head,
          base: ctx.config.base,
        },
      )
      return { id: data.number, url: data.html_url, data }
    }

    case 'List Pull Requests': {
      const params = new URLSearchParams()
      if (ctx.config.state) params.set('state', String(ctx.config.state))
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await githubRequest(
        'GET',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/pulls${query}`,
      )
      return { id: null, url: null, data: { items: data } }
    }

    case 'Merge Pull Request': {
      if (!ctx.config.pullNumber) {
        throw new Error('Pull Request Number is required for Merge Pull Request')
      }
      const data = await githubRequest(
        'PUT',
        `/repos/${ctx.config.owner}/${ctx.config.repo}/pulls/${ctx.config.pullNumber}/merge`,
        { merge_method: 'merge' },
      )
      return { id: ctx.config.pullNumber, url: null, data }
    }

    case 'Get Repository': {
      const data = await githubRequest('GET', `/repos/${ctx.config.owner}/${ctx.config.repo}`)
      return { id: data.id, url: data.html_url, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
