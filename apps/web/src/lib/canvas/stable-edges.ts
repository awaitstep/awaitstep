type Shallow = Record<string, unknown>

function shallowEqual(a: Shallow, b: Shallow): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((k) => {
    if (a[k] === b[k]) return true
    // An edge's `data` is rebuilt with each pass; compare what is in it.
    if (k === 'data' && a[k] && b[k] && typeof a[k] === 'object' && typeof b[k] === 'object') {
      return shallowEqual(a[k] as Shallow, b[k] as Shallow)
    }
    return false
  })
}

/**
 * `next`, reusing each of `prev`'s edge objects that is unchanged — and `prev`
 * itself when none changed — so a node drag that moves no edge to another side
 * re-renders no edge and no node's handles.
 */
export function reuseUnchanged<E extends { id: string }>(prev: readonly E[], next: E[]): E[] {
  const byId = new Map(prev.map((e) => [e.id, e]))
  let same = prev.length === next.length
  const out = next.map((edge, i) => {
    const old = byId.get(edge.id)
    if (old && shallowEqual(old as unknown as Shallow, edge as unknown as Shallow)) {
      if (prev[i] !== old) same = false
      return old
    }
    same = false
    return edge
  })
  return same ? (prev as E[]) : out
}
