import { createClient } from '@supabase/supabase-js'

export default async function (ctx) {
  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_ANON_KEY)
  const action = ctx.config.action
  const table = ctx.config.table

  function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value
  }

  function applyFilter(query: any, filter: any) {
    const f = typeof filter === 'string' ? JSON.parse(filter) : filter
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
      const data = parseJson(ctx.config.data) as Record<string, unknown>
      let query = supabase.from(table).update(data)
      if (ctx.config.filter) query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    case 'Delete Rows': {
      let query = supabase.from(table).delete()
      if (ctx.config.filter) query = applyFilter(query, ctx.config.filter)
      const { data: rows, error } = await query.select()
      if (error) throw new Error(`Supabase error: ${error.message}`)
      return { rows, count: rows?.length ?? 0, data: rows }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
