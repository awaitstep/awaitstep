import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { debounce } from '../../lib/debounce'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  debounceMs?: number
}

function Input({ className, type, debounceMs, value, onChange, ...props }: InputProps) {
  const [localValue, setLocalValue] = useState(value)
  const pendingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const debouncedOnChange = useMemo(
    () =>
      debounceMs
        ? debounce((e: React.ChangeEvent<HTMLInputElement>) => {
            pendingRef.current = false
            onChangeRef.current?.(e)
          }, debounceMs)
        : null,
    [debounceMs],
  )

  useEffect(() => {
    if (!pendingRef.current) setLocalValue(value)
  }, [value])

  useEffect(() => () => debouncedOnChange?.cancel(), [debouncedOnChange])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (debouncedOnChange) {
        setLocalValue(e.target.value)
        pendingRef.current = true
        debouncedOnChange(e)
      } else {
        onChange?.(e)
      }
    },
    [debouncedOnChange, onChange],
  )

  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      value={debouncedOnChange ? localValue : value}
      onChange={handleChange}
      {...props}
    />
  )
}

export { Input }
export type { InputProps }
