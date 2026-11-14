import { Banner } from '../ui/banner'
import { ShellLink } from '../ui/shell-link'
import type { CustomNodeSource } from '../../contexts/node-registry-context'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { libraryItemHref } from '../../lib/library/item-links'

/** A placed Library node's line in its panel (28n): what it is, its version, and where to change it. */
export function CustomNodeSourceLine({ source }: { source: CustomNodeSource }) {
  const scope = useEditorScope()
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded-full bg-node-custom/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-node-custom">
        Custom node
      </span>
      <span className="tabular-nums">v{source.version}</span>
      {scope && (
        <>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <ShellLink
            href={libraryItemHref(scope, source)}
            className="font-medium text-primary "
          >
            Open in Scripts & nodes
          </ShellLink>
        </>
      )}
    </div>
  )
}

/**
 * A placed `custom:<id>` this workflow cannot use (28o). No name: the item
 * may be another workspace's, and the palette never named it here.
 */
export function CustomNodeUnavailable() {
  return <Banner tone="warn">This custom node isn’t published, or isn’t in this workspace.</Banner>
}

/** The custom nodes could not be read, so nothing can be said about this one. */
export function CustomNodesLoadFailed() {
  return <Banner tone="warn">Couldn’t load your custom nodes. Reload to try again.</Banner>
}
