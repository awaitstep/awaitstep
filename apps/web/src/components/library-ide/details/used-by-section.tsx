import { useLibraryUsages } from '../../../data/dashboard/library'
import type {
  ApiLibraryConsumerItem,
  ApiLibraryConsumerWorkflow,
  ApiLibraryTreeItem,
} from '../../../lib/library-api'
import { DetailsSection } from './details-section'

function consumerNote(consumer: ApiLibraryConsumerWorkflow | ApiLibraryConsumerItem): string {
  if (consumer.kind === 'item') return consumer.itemKind === 'module' ? 'module' : 'custom node'
  return consumer.runs ? `runs v${consumer.runs}` : 'not deployed'
}

/** What the item imports, who uses it, and the version each workflow's live deployment runs. */
export function UsedBySection({ item }: { item: ApiLibraryTreeItem }) {
  const usages = useLibraryUsages(item.id)
  const data = usages.data
  const visible = data?.usedBy.visible ?? []
  const hidden = data?.usedBy.hiddenCount ?? 0
  return (
    <>
      {item.kind === 'node' || (data?.uses.length ?? 0) > 0 ? (
        <DetailsSection title="Uses">
          {!data ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : data.uses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No modules.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {data.uses.map((module) => (
                <li key={module.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate font-mono text-foreground">
                    #modules/{module.slug}
                  </span>
                  <span className="text-muted-foreground">{module.owner.name}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailsSection>
      ) : null}
      <DetailsSection
        title="Used by"
        note="Workflows pick up the latest published version on their next deploy."
      >
        {usages.isError ? (
          <p role="alert" className="text-xs text-status-error">
            Couldn’t load who uses it.
          </p>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : visible.length === 0 && hidden === 0 ? (
          <p className="text-xs text-muted-foreground">Not used yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((consumer) => (
              <li
                key={`${consumer.kind}:${consumer.id}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="flex-1 truncate text-foreground">{consumer.name}</span>
                <span className="text-muted-foreground">{consumerNote(consumer)}</span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="text-xs text-muted-foreground">
                {hidden === 1 ? '1 more you can’t open' : `${hidden} more you can’t open`}
              </li>
            )}
          </ul>
        )}
      </DetailsSection>
    </>
  )
}
