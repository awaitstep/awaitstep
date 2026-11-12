export default async function (ctx: any) {
  const accessToken = ctx.env.FIREBASE_ACCESS_TOKEN
  const action = ctx.config.action
  const projectId = ctx.config.projectId
  const collection = ctx.config.collection
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

  function toFirestoreValue(val: unknown): Record<string, unknown> {
    if (val === null) return { nullValue: null }
    if (typeof val === 'string') return { stringValue: val }
    if (typeof val === 'number')
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
    if (typeof val === 'boolean') return { booleanValue: val }
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } }
    if (typeof val === 'object') {
      const fields: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(val as Record<string, unknown>))
        fields[key] = toFirestoreValue(value)
      return { mapValue: { fields } }
    }
    return { stringValue: String(val) }
  }

  function fromFirestoreValue(val: Record<string, unknown>): unknown {
    if ('stringValue' in val) return val.stringValue
    if ('integerValue' in val) return Number(val.integerValue)
    if ('doubleValue' in val) return val.doubleValue
    if ('booleanValue' in val) return val.booleanValue
    if ('nullValue' in val) return null
    if ('arrayValue' in val) {
      const arr = val.arrayValue as { values?: Record<string, unknown>[] }
      return (arr.values ?? []).map(fromFirestoreValue)
    }
    if ('mapValue' in val) {
      const map = val.mapValue as {
        fields?: Record<string, Record<string, unknown>>
      }
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(map.fields ?? {}))
        result[key] = fromFirestoreValue(value)
      return result
    }
    return null
  }

  function toFirestoreFields(data: Record<string, unknown>) {
    const fields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) fields[key] = toFirestoreValue(value)
    return fields
  }

  function fromFirestoreFields(fields: Record<string, Record<string, unknown>>) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) result[key] = fromFirestoreValue(value)
    return result
  }

  function extractDocId(name: string): string {
    const parts = name.split('/')
    return parts[parts.length - 1]
  }

  function toFirestoreQueryValue(val: unknown): Record<string, unknown> {
    const type = String(ctx.config.queryValueType ?? 'string')
    if (type === 'null') return { nullValue: null }
    if (type === 'boolean') {
      if (val === true || val === 'true') return { booleanValue: true }
      if (val === false || val === 'false') return { booleanValue: false }
      throw new Error('Query Value must be true or false when Query Value Type is boolean')
    }
    if (type === 'number') {
      const number = Number(val)
      if (!Number.isFinite(number)) {
        throw new Error('Query Value must be a number when Query Value Type is number')
      }
      return Number.isInteger(number) ? { integerValue: String(number) } : { doubleValue: number }
    }
    return { stringValue: String(val ?? '') }
  }

  function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(
        'Invalid JSON input: ' + (value.length > 100 ? value.slice(0, 100) + '...' : value),
      )
    }
  }

  async function firestoreApi(method: string, path: string, body?: unknown) {
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(`${baseUrl}${path}`, options)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Firestore API error (${response.status}): ${text}`)
    }
    if (method === 'DELETE' || response.status === 204) return {}
    return (await response.json()) as Record<string, unknown>
  }

  switch (action) {
    case 'Create Document': {
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      const result = await firestoreApi('POST', `/${collection}`, {
        fields: toFirestoreFields(data),
      })
      const name = result.name as string
      return {
        id: extractDocId(name),
        data: fromFirestoreFields(result.fields as Record<string, Record<string, unknown>>),
      }
    }

    case 'Get Document': {
      const result = await firestoreApi('GET', `/${collection}/${ctx.config.documentId}`)
      return {
        id: extractDocId(result.name as string),
        data: fromFirestoreFields(result.fields as Record<string, Record<string, unknown>>),
      }
    }

    case 'Update Document': {
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      const fields = toFirestoreFields(data)
      const updateMask = Object.keys(data)
        .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
        .join('&')
      const result = await firestoreApi(
        'PATCH',
        `/${collection}/${ctx.config.documentId}?${updateMask}`,
        { fields },
      )
      return {
        id: extractDocId(result.name as string),
        data: fromFirestoreFields(result.fields as Record<string, Record<string, unknown>>),
      }
    }

    case 'Delete Document': {
      await firestoreApi('DELETE', `/${collection}/${ctx.config.documentId}`)
      return { id: String(ctx.config.documentId ?? ''), data: {} }
    }

    case 'Query Collection': {
      const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId: collection }],
        limit: ctx.config.limit ?? 100,
      }
      if (ctx.config.queryField) {
        structuredQuery.where = {
          fieldFilter: {
            field: { fieldPath: ctx.config.queryField },
            op: ctx.config.queryOp ?? 'EQUAL',
            value: toFirestoreQueryValue(ctx.config.queryValue),
          },
        }
      }
      const result = (await firestoreApi('POST', ':runQuery', {
        structuredQuery,
      })) as unknown as Array<{
        document?: { name: string; fields: Record<string, Record<string, unknown>> }
      }>
      const docs = Array.isArray(result)
        ? result
            .filter((row) => row.document)
            .map((row) => ({
              id: extractDocId(row.document!.name),
              ...fromFirestoreFields(row.document!.fields),
            }))
        : []
      return { id: '', data: docs }
    }

    case 'List Collections': {
      const result = await firestoreApi('POST', ':listCollectionIds', {
        pageSize: ctx.config.limit ?? 100,
      })
      return { id: '', data: result }
    }

    case 'Batch Write': {
      const writes = parseJson(ctx.config.writes)
      if (!Array.isArray(writes)) throw new Error('Writes must be a JSON array')
      const result = await firestoreApi('POST', ':batchWrite', { writes })
      return { id: '', data: result }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
