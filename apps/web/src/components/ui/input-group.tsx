import { useId, type ReactElement } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { joinIds } from './form-field'

interface InputGroupProps {
  /** Fixed text before the value, e.g. "awaitstep.dev/acme/". */
  prefix: string
  /** One `Input`. */
  children: ReactElement
  /** Ids, `aria-*` and the like from `FormField`, passed on to the input. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

/**
 * An input with fixed text in front of it, like a URL's base. The prefix is
 * part of the input's description, not its name.
 */
export function InputGroup({
  prefix,
  children,
  'aria-describedby': describedBy,
  ...controlProps
}: InputGroupProps) {
  const prefixId = useId()
  return (
    <span className="flex h-10 w-full items-center overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
      <span
        id={prefixId}
        className="flex h-full shrink-0 items-center border-r border-input bg-card px-2.5 text-xs text-muted-foreground"
      >
        {prefix}
      </span>
      <Slot
        {...controlProps}
        aria-describedby={joinIds(prefixId, describedBy)}
        className="h-full min-w-0 flex-1 rounded-none border-0 focus-visible:ring-0"
      >
        {children}
      </Slot>
    </span>
  )
}
