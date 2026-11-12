export default async function (ctx) {
  const token = ctx.env.ASANA_ACCESS_TOKEN
  const action = ctx.config.action

  async function asanaRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(`https://app.asana.com/api/1.0${path}`, {
      method,
      headers,
      body: body ? JSON.stringify({ data: body }) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as Array<{ message: string }> | undefined
      throw new Error(`Asana API error: ${errors?.[0]?.message ?? response.statusText}`)
    }
    return data
  }

  async function asanaApi(method: string, path: string, body?: Record<string, unknown>) {
    const data = await asanaRequest(method, path, body)
    return data.data as Record<string, unknown>
  }

  switch (action) {
    case 'Create Task': {
      const body: Record<string, unknown> = { name: ctx.config.name }
      if (ctx.config.projectId) body.projects = [ctx.config.projectId]
      if (ctx.config.notes) body.notes = ctx.config.notes
      if (ctx.config.assignee) body.assignee = ctx.config.assignee
      if (ctx.config.dueOn) body.due_on = ctx.config.dueOn
      const data = await asanaApi('POST', '/tasks', body)
      return { id: data.gid as string, status: 'created', data }
    }

    case 'Get Task': {
      const data = await asanaApi('GET', `/tasks/${ctx.config.taskId}`)
      return { id: data.gid as string, status: 'ok', data }
    }

    case 'Update Task': {
      const body: Record<string, unknown> = {}
      if (ctx.config.name) body.name = ctx.config.name
      if (ctx.config.notes) body.notes = ctx.config.notes
      if (ctx.config.assignee) body.assignee = ctx.config.assignee
      if (ctx.config.dueOn) body.due_on = ctx.config.dueOn
      const data = await asanaApi('PUT', `/tasks/${ctx.config.taskId}`, body)
      return { id: data.gid as string, status: 'updated', data }
    }

    case 'List Tasks': {
      const params = new URLSearchParams({ project: String(ctx.config.projectId ?? '') })
      const data = await asanaRequest('GET', `/tasks?${params.toString()}`)
      return { id: null, status: 'ok', data }
    }

    case 'Add Comment': {
      const data = await asanaApi('POST', `/tasks/${ctx.config.taskId}/stories`, {
        text: ctx.config.commentText,
      })
      return { id: data.gid as string, status: 'created', data }
    }

    case 'Delete Task': {
      if (!ctx.config.taskId) throw new Error('Task ID is required for Delete Task')
      await asanaApi('DELETE', `/tasks/${ctx.config.taskId}`)
      return { id: String(ctx.config.taskId), status: 'deleted', data: {} }
    }

    case 'Complete Task': {
      if (!ctx.config.taskId) throw new Error('Task ID is required for Complete Task')
      const data = await asanaApi('PUT', `/tasks/${ctx.config.taskId}`, { completed: true })
      return { id: data.gid as string, status: 'completed', data }
    }

    case 'List Projects': {
      const data = await asanaRequest('GET', '/projects?limit=100')
      return { id: null, status: 'ok', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
