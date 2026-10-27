/** Export stops here; a bigger export is a backend job (B1). */
export const EXPORT_CAP = 1000

const EXPORT_PAGE_SIZE = 100

type FetchPage<T> = (
  cursor: string | undefined,
  limit: number,
) => Promise<{
  data: T[]
  nextCursor: string | null
}>

/** Every row a cursor-paged list returns, page by page, up to `EXPORT_CAP`. */
export async function collectPages<T>(fetchPage: FetchPage<T>): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor, EXPORT_PAGE_SIZE)
    rows.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor && rows.length < EXPORT_CAP)
  return rows.slice(0, EXPORT_CAP)
}
