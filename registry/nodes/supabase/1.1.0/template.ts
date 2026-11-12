import { createClient } from '@supabase/supabase-js'

export default async function (ctx) {
  const supabase = createClient(ctx.config.supabaseUrl, ctx.env.SUPABASE_ANON_KEY)
  const action = ctx.config.action
  const table = ctx.config.table

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

  function applyFilter(query: any, filter: any) {
    let parsed: any
    if (typeof filter === 'string') {
      try {
        parsed = JSON.parse(filter)
      } catch {
        throw new Error('Invalid JSON in filter field')
      }
    } else {
      parsed = filter
    }
    if (parsed && parsed.column && parsed.op && parsed.value !== undefined) {
      return query.filter(parsed.column, parsed.op, parsed.value)
    }
    return query
  }

  switch (action) {
    case 'Insert Row': {
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      const { data: rows, error } = await supabase.from(table).insert(data).select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Select Rows': {
      const columns = ctx.config.columns ?? '*'
      let query = supabase
        .from(table)
        .select(columns)
        .limit(ctx.config.limit ?? 100)
      if (ctx.config.filter) query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Update Rows': {
      if (!ctx.config.filter) {
        throw new Error('Update Rows requires a filter to prevent updating all rows')
      }
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      let query = supabase.from(table).update(data)
      query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Delete Rows': {
      if (!ctx.config.filter) {
        throw new Error('Delete Rows requires a filter to prevent deleting all rows')
      }
      let query = supabase.from(table).delete()
      query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Upsert Row': {
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      const { data: rows, error } = await supabase.from(table).upsert(data).select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Count Rows': {
      let query = supabase.from(table).select('*', { count: 'exact', head: true })
      if (ctx.config.filter) query = applyFilter(query, ctx.config.filter)
      const { count, error } = await query
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows: [], count: count ?? 0, data: { count } }
    }

    case 'RPC': {
      if (!ctx.config.functionName) throw new Error('Function Name is required for RPC')
      const args = (parseJson(ctx.config.args) ?? {}) as Record<string, unknown>
      const { data, error } = await supabase.rpc(String(ctx.config.functionName), args)
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return {
        rows: Array.isArray(data) ? data : [],
        count: Array.isArray(data) ? data.length : 0,
        data,
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
