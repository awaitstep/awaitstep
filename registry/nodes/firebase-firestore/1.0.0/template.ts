export default async function (ctx) {
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
      for (const [k, v] of Object.entries(val as Record<string, unknown>))
        fields[k] = toFirestoreValue(v)
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
      for (const [k, v] of Object.entries(map.fields ?? {})) result[k] = fromFirestoreValue(v)
      return result
    }
    return null
  }

  function toFirestoreFields(data: Record<string, unknown>) {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) fields[k] = toFirestoreValue(v)
    return fields
  }

  function fromFirestoreFields(fields: Record<string, Record<string, unknown>>) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) result[k] = fromFirestoreValue(v)
    return result
  }

  function extractDocId(name: string): string {
    const parts = name.split('/')
    return parts[parts.length - 1]
  }

  function toFirestoreQueryValue(val: unknown): Record<string, unknown> {
    if (val === null || val === undefined) return { nullValue: null }
    if (typeof val === 'boolean') return { booleanValue: val }
    if (typeof val === 'number')
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
    if (typeof val === 'string') {
      if (val === 'true') return { booleanValue: true }
      if (val === 'false') return { booleanValue: false }
      const num = Number(val)
      if (val !== '' && !isNaN(num)) {
        return Number.isInteger(num) ? { integerValue: String(num) } : { doubleValue: num }
      }
      return { stringValue: val }
    }
    return toFirestoreValue(val)
  }

  function parseJson(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string') return value as Record<string, unknown>
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
    if (method === 'DELETE') return {}
    return (await response.json()) as Record<string, unknown>
  }

  switch (action) {
    case 'Create Document': {
      const data = parseJson(ctx.config.data)
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
      const data = parseJson(ctx.config.data)
      const fields = toFirestoreFields(data)
      const updateMask = Object.keys(data)
        .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
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
      return { id: ctx.config.documentId, data: {} }
    }

    case 'Query Collection': {
      const result = (await firestoreApi('POST', ':runQuery', {
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: ctx.config.queryField },
              op: ctx.config.queryOp ?? 'EQUAL',
              value: toFirestoreQueryValue(ctx.config.queryValue),
            },
          },
        },
      })) as unknown as Array<{
        document?: { name: string; fields: Record<string, Record<string, unknown>> }
      }>
      const docs = Array.isArray(result)
        ? result
            .filter((r) => r.document)
            .map((r) => ({
              id: extractDocId(r.document!.name),
              ...fromFirestoreFields(r.document!.fields),
            }))
        : []
      return { id: '', data: docs }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
