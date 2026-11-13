import { useState } from 'react'
import type { LibraryKind } from '../../../lib/library-api'
import { Tile } from '../../ui/tile'

const GLYPH: Record<LibraryKind, string> = { module: '{}', node: '<>' }
const TONE = { module: 'warn', node: 'info' } as const

interface LibraryKindTileProps {
  kind: LibraryKind
  className?: string
  /** The node's own logo; the kind's glyph shows without one, or when it fails to load. */
  iconSrc?: string
}

/** A module's `{}` or a custom node's `<>` tile (28a), or the node's logo when it has one. */
export function LibraryKindTile({ kind, className, iconSrc }: LibraryKindTileProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showIcon = iconSrc !== undefined && failed !== iconSrc

  function handleError() {
    setFailed(iconSrc ?? null)
  }

  return (
    <Tile tone={TONE[kind]} size="sm" className={className}>
      {showIcon ? (
        <img
          src={iconSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="size-4 object-contain"
          onError={handleError}
        />
      ) : (
        <span className="font-mono">{GLYPH[kind]}</span>
      )}
    </Tile>
  )
}
