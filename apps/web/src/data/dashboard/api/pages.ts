interface Page<Row> {
  data: Row[]
  nextCursor: string | null
}

/**
 * Every page of a paginated list, as one: the dashboard's lists draw the
 * whole set and have no pager, so a page size is not a cap. The first page's
 * other fields are kept.
 */
export async function allPages<T extends Page<unknown>>(
  fetchPage: (cursor?: string) => Promise<T>,
): Promise<T> {
  const first = await fetchPage()
  const data = [...first.data]
  let cursor = first.nextCursor
  while (cursor) {
    const page = await fetchPage(cursor)
    data.push(...page.data)
    cursor = page.nextCursor
  }
  return { ...first, data, nextCursor: null }
}
