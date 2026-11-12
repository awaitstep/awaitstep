import type { LibraryKind } from '../../../lib/library-api'
import { Tile } from '../../ui/tile'

const GLYPH: Record<LibraryKind, string> = { module: '{}', node: '<>' }
const TONE = { module: 'warn', node: 'info' } as const

/** A module's `{}` or a custom node's `<>` tile (28a). */
export function LibraryKindTile({ kind, className }: { kind: LibraryKind; className?: string }) {
  return (
    <Tile tone={TONE[kind]} size="sm" className={className}>
      <span className="font-mono">{GLYPH[kind]}</span>
    </Tile>
  )
}
