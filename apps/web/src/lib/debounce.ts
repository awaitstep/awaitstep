type AnyFn = (...args: never[]) => void

export interface Debounced {
  /** Drops the pending call. */
  cancel(): void
  /** Runs the pending call now, if there is one. */
  flush(): void
}

export function debounce<T extends AnyFn>(fn: T, delay: number): T & Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Parameters<T> | undefined

  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    pending = args
    timer = setTimeout(() => {
      timer = undefined
      pending = undefined
      fn(...args)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
      pending = undefined
    }
  }

  debounced.flush = () => {
    if (!timer || !pending) return
    const args = pending
    debounced.cancel()
    fn(...args)
  }

  return debounced as T & Debounced
}
