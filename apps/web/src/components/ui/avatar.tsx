import { useState } from 'react'
import { initialsOf } from '../../lib/initials'
import { cn } from '../../lib/utils'

const sizeClasses = {
  sm: 'h-6 w-6 text-2xs',
  default: 'h-8 w-8 text-xs',
} as const

export interface AvatarProps {
  name?: string | null
  email?: string | null
  src?: string | null
  size?: keyof typeof sizeClasses
  className?: string
}

function Avatar({ name, email, src, size = 'default', className }: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(src) && !errored

  function handleImageError() {
    setErrored(true)
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground',
        sizeClasses[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={name ?? email ?? 'Avatar'}
          className="h-full w-full object-cover"
          onError={handleImageError}
        />
      ) : (
        initialsOf(name, email)
      )}
    </span>
  )
}

export { Avatar }
