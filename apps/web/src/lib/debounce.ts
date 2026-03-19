type AnyFn = (...args: never[]) => void

export function debounce<T extends AnyFn>(fn: T, delay: number): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return debounced as T & { cancel(): void }
}
