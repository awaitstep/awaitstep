import { useState } from 'react'
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

function initialsOf(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || ''
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
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
