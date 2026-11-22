/** One list item's searchable data: its category and its lower-cased keywords. */
export interface Filterable {
  category: string
  keywords: string
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/**
 * Whether an item passes the filter: in the chosen category (an empty category is all), and
 * every word of the query starting one of its keywords, in any order ("ai" finds "AI" and
 * "Airtable", not "Email").
 */
export function matchesFilter(item: Filterable, query: string, category: string): boolean {
  if (category && item.category !== category) return false
  const words = wordsOf(query)
  const keywords = wordsOf(item.keywords)
  return words.every((word) => keywords.some((k) => k.startsWith(word)))
}

/**
 * A filterable list: a search box and category chips narrow it as you type or pick. The controls
 * stay hidden without script, so the full list shows.
 */
export function initFilter(root: ParentNode = document) {
  const section = root.querySelector<HTMLElement>('[data-filterable]')
  const controls = section?.querySelector<HTMLElement>('[data-filter]')
  const input = section?.querySelector<HTMLInputElement>('[data-filter-query]')
  const list = section?.querySelector<HTMLElement>('[data-filter-list]')
  const empty = section?.querySelector<HTMLElement>('[data-filter-empty]')
  const count = section?.querySelector<HTMLElement>('[data-filter-count]')
  if (!section || !controls || !input || !list) return
  const chips = [...section.querySelectorAll<HTMLButtonElement>('[data-filter-category]')]
  const items = [...list.querySelectorAll<HTMLElement>('[data-category]')]
  controls.hidden = false

  let category = ''
  const apply = () => {
    let shown = 0
    for (const item of items) {
      const data = { category: item.dataset.category ?? '', keywords: item.dataset.keywords ?? '' }
      const visible = matchesFilter(data, input.value, category)
      item.hidden = !visible
      if (visible) shown++
    }
    if (empty) empty.hidden = shown > 0
    if (count) count.textContent = `${shown} of ${items.length}`
  }

  input.addEventListener('input', apply)
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      category = chip.dataset.filterCategory ?? ''
      for (const c of chips) c.setAttribute('aria-pressed', String(c === chip))
      apply()
    })
  }
  apply()
}
