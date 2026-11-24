import { useState, type ChangeEvent } from 'react'
import { Search } from 'lucide-react'
import type { NodeType } from '@awaitstep/ir'
import type { NodeSide } from '../../lib/canvas/node-sides'
import { Input } from '../ui/input'
import { PaletteRow } from './node-palette-row'
import { BUILTIN_IDS, usePaletteGroups } from './use-palette-groups'

const SIDE_TITLE: Record<NodeSide, string> = {
  top: 'Add above',
  left: 'Add to the left',
  bottom: 'Add below',
  right: 'Add to the right',
}

interface NodeInsertListProps {
  side: NodeSide
  /** The node the + belongs to. */
  fromName: string
  onPick: (type: NodeType) => void
}

/** The node selector a + on a canvas node opens (board 31c). */
export function NodeInsertList({ side, fromName, onPick }: NodeInsertListProps) {
  const [search, setSearch] = useState('')
  const { groups, customNodes } = usePaletteGroups(search)

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value)
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 pb-2 pt-2.5">
        <span className="text-xs font-semibold text-foreground">{SIDE_TITLE[side]}</span>
        <span className="ml-auto truncate font-mono text-2xs text-muted-foreground">
          from {fromName}
        </span>
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            autoFocus
            aria-label="Search nodes"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search nodes…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h4 className="flex items-center justify-between px-2 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
              <span className="font-mono font-normal tabular-nums">{group.nodes.length}</span>
            </h4>
            {group.nodes.map((definition) => (
              <PaletteRow
                key={definition.id}
                mode="pick"
                definition={definition}
                source={customNodes.get(definition.id)}
                builtin={BUILTIN_IDS.has(definition.id)}
                onAdd={onPick}
              />
            ))}
          </section>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No nodes match.</p>
        )}
      </div>
    </>
  )
}
