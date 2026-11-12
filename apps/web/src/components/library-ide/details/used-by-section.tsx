import { useLibraryUsages } from '../../../data/dashboard/library'
import type {
  ApiLibraryConsumerItem,
  ApiLibraryConsumerWorkflow,
  ApiLibraryTreeItem,
} from '../../../lib/library-api'
import { DetailsEmpty, DetailsSection, DotRow } from './details-section'

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
            <DetailsEmpty>Loading…</DetailsEmpty>
          ) : data.uses.length === 0 ? (
            <DetailsEmpty>No modules.</DetailsEmpty>
          ) : (
            <ul className="flex flex-col">
              {data.uses.map((module) => (
                <DotRow key={module.id}>
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                    #modules/{module.slug}
                  </span>
                  <span className="text-2xs text-muted-foreground">{module.owner.name}</span>
                </DotRow>
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
          <DetailsEmpty>Loading…</DetailsEmpty>
        ) : visible.length === 0 && hidden === 0 ? (
          <DetailsEmpty>Not used yet.</DetailsEmpty>
        ) : (
          <ul className="flex flex-col">
            {visible.map((consumer) => (
              <DotRow key={`${consumer.kind}:${consumer.id}`}>
                <span className="min-w-0 flex-1 truncate text-muted-foreground/90">
                  {consumer.name}
                </span>
                <span className="text-2xs text-muted-foreground">{consumerNote(consumer)}</span>
              </DotRow>
            ))}
            {hidden > 0 && (
              <li className="pt-1 text-2xs text-muted-foreground">
                {hidden === 1 ? '1 more you can’t open' : `${hidden} more you can’t open`}
              </li>
            )}
          </ul>
        )}
      </DetailsSection>
    </>
  )
}
