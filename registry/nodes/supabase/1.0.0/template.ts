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
    let f: any
    if (typeof filter === 'string') {
      try {
        f = JSON.parse(filter)
      } catch {
        throw new Error('Invalid JSON in filter field')
      }
    } else {
      f = filter
    }
    if (f && f.column && f.op && f.value !== undefined) {
      return query.filter(f.column, f.op, f.value)
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
      if (!ctx.config.filter)
        throw new Error('Update Rows requires a filter to prevent updating all rows')
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      let query = supabase.from(table).update(data)
      query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Delete Rows': {
      if (!ctx.config.filter)
        throw new Error('Delete Rows requires a filter to prevent deleting all rows')
      let query = supabase.from(table).delete()
      query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
