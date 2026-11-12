export default async function (ctx) {
  const token = ctx.env.GOOGLE_SHEETS_ACCESS_TOKEN
  const action = ctx.config.action
  const spreadsheetId = ctx.config.spreadsheetId

  async function sheetsApi(method: string, path: string, body?: unknown) {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    )
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Google Sheets API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  function requireRange(): string {
    const value = ctx.config.range
    if (!value) throw new Error('Range is required for this action')
    return String(value)
  }

  function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error('Invalid JSON in Batch Requests')
    }
  }

  switch (action) {
    case 'Read Rows': {
      const data = await sheetsApi('GET', `/values/${encodeURIComponent(requireRange())}`)
      const values = (data.values ?? []) as unknown[][]
      return { values, updatedCells: 0, data }
    }

    case 'Append Row': {
      const values =
        typeof ctx.config.values === 'string' ? JSON.parse(ctx.config.values) : ctx.config.values
      const data = await sheetsApi(
        'POST',
        `/values/${encodeURIComponent(requireRange())}:append?valueInputOption=USER_ENTERED`,
        { values },
      )
      const updates = data.updates as { updatedCells?: number } | undefined
      return { values: [], updatedCells: updates?.updatedCells ?? 0, data }
    }

    case 'Update Row': {
      const values =
        typeof ctx.config.values === 'string' ? JSON.parse(ctx.config.values) : ctx.config.values
      const data = await sheetsApi(
        'PUT',
        `/values/${encodeURIComponent(requireRange())}?valueInputOption=USER_ENTERED`,
        { values },
      )
      return { values: [], updatedCells: (data.updatedCells as number) ?? 0, data }
    }

    case 'Clear Range': {
      const data = await sheetsApi('POST', `/values/${encodeURIComponent(requireRange())}:clear`)
      return { values: [], updatedCells: 0, data }
    }

    case 'Get Spreadsheet': {
      const data = await sheetsApi('GET', '')
      return { values: [], updatedCells: 0, data }
    }

    case 'Batch Update': {
      const requests = parseJson(ctx.config.requests)
      if (!Array.isArray(requests)) throw new Error('Batch Requests must be a JSON array')
      const data = await sheetsApi('POST', ':batchUpdate', { requests })
      return { values: [], updatedCells: 0, data }
    }

    case 'Add Sheet': {
      if (!ctx.config.sheetTitle) throw new Error('Sheet Title is required for Add Sheet')
      const data = await sheetsApi('POST', ':batchUpdate', {
        requests: [
          {
            addSheet: {
              properties: { title: ctx.config.sheetTitle },
            },
          },
        ],
      })
      return { values: [], updatedCells: 0, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
