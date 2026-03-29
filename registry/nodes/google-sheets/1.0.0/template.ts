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

  const range = ctx.config.range

  switch (action) {
    case 'Read Rows': {
      const data = await sheetsApi('GET', `/values/${encodeURIComponent(range)}`)
      const values = (data.values ?? []) as unknown[][]
      return { values, updatedCells: 0, data }
    }

    case 'Append Row': {
      const values =
        typeof ctx.config.values === 'string' ? JSON.parse(ctx.config.values) : ctx.config.values
      const data = await sheetsApi(
        'POST',
        `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
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
        `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        { values },
      )
      return { values: [], updatedCells: (data.updatedCells as number) ?? 0, data }
    }

    case 'Clear Range': {
      const data = await sheetsApi('POST', `/values/${encodeURIComponent(range)}:clear`)
      return { values: [], updatedCells: 0, data }
    }

    case 'Get Spreadsheet': {
      const data = await sheetsApi('GET', '')
      return { values: [], updatedCells: 0, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
