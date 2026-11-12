import { Button } from '../../ui/button'
import { EmptyState } from '../../ui/empty-state'
import { LibraryKindTile } from './library-kind-tile'

interface LibraryEmptyProps {
  placeName: string
  canCreate: boolean
  onNewModule: () => void
  onNewNode: () => void
}

/** Nothing owned yet (28c): the two kinds, and a way to add each. */
export function LibraryEmpty({ placeName, canCreate, onNewModule, onNewNode }: LibraryEmptyProps) {
  return (
    <EmptyState
      icon={
        <span className="flex gap-2">
          <LibraryKindTile kind="module" />
          <LibraryKindTile kind="node" />
        </span>
      }
      title={`Nothing in ${placeName} yet`}
      description="Add a module for reusable code, or a custom node for a step on the canvas."
      actions={
        canCreate ? (
          <>
            <Button type="button" onClick={onNewModule}>
              New module
            </Button>
            <Button type="button" variant="outline" onClick={onNewNode}>
              New node
            </Button>
          </>
        ) : null
      }
    />
  )
}
