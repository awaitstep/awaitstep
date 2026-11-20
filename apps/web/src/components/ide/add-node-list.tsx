import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { NodeDefinition } from '@awaitstep/ir'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { filterNodes, templateNodeGroups } from '../../lib/node-categories'
import { PaletteRow } from '../canvas/node-palette-row'
import { Input } from '../ui/input'
import { AddNodeMarketplace } from './add-node-marketplace'

interface AddNodeListProps {
  onPick: (definition: NodeDefinition) => void
  /** Why the last Insert failed, or that none is picked yet. */
  error: string | null
}

/**
 * Add → Custom node: the canvas palette's Library nodes (with their version
 * and "Project" tag), then its marketplace nodes. Builtins other than a step
 * keep their canvas flows, so they are not listed.
 */
export function AddNodeList({ onPick, error }: AddNodeListProps) {
  const { registry, customNodes } = useNodeRegistry()
  const [search, setSearch] = useState('')
  // getAll copies the list on each call: read it once per registry.
  const definitions = useMemo(() => registry.getAll(), [registry])
  const groups = useMemo(
    () => templateNodeGroups(search ? filterNodes(definitions, search) : definitions),
    [definitions, search],
  )
  const byId = useMemo(() => new Map(definitions.map((d) => [d.id, d])), [definitions])

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value)
  }

  function handlePick(type: string) {
    const definition = byId.get(type)
    if (definition) onPick(definition)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-4">
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
        {error !== null && (
          <p role="alert" className="pt-2 text-2xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="min-h-[200px] flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h4 className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
              {group.label}
            </h4>
            {group.nodes.map((definition) => (
              <PaletteRow
                key={definition.id}
                mode="pick"
                definition={definition}
                source={customNodes.get(definition.id)}
                builtin={false}
                onAdd={handlePick}
              />
            ))}
          </section>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {search
              ? 'No nodes match your search.'
              : 'No custom nodes yet. Publish one in Scripts & nodes, or install one from the marketplace.'}
          </p>
        )}
      </div>
      <AddNodeMarketplace />
    </div>
  )
}
