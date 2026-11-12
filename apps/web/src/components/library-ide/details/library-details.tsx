import { useMemo } from 'react'
import { useIdeStore } from '../../../stores/ide-store'
import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { itemRoot } from '../../../lib/library/ide-index'
import { manifestSummary } from '../../../lib/library/manifest-summary'
import { Button } from '../../ui/button'
import { DynamicFields } from '../../canvas/dynamic-fields'
import { KIND_LABEL } from '../../library/library-format'
import { LibraryKindTile } from '../../library/parts/library-kind-tile'
import { DetailsEmpty, DetailsSection, DotRow } from './details-section'
import { UsedBySection } from './used-by-section'
import { VersionsSection } from './versions-section'

interface LibraryDetailsProps {
  item: ApiLibraryTreeItem | null
  /** A file's text as the editor has it, drafts included; undefined while loading. */
  sourceOf: (path: string) => string | undefined
  canEdit: boolean
  onRestore: (item: ApiLibraryTreeItem, version: string) => void
  onHistory: (item: ApiLibraryTreeItem) => void
}

function noop() {}

function defaultsOf(schema: Record<string, { default?: unknown }>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema).map(([key, field]) => [key, field.default]))
}

/**
 * The side pane's Details (28d/28e): what the item is, its manifest, its
 * versions, its dependencies or (for a node) how it looks on the canvas,
 * and who uses it. Everything is read from the files as edited.
 */
export function LibraryDetails({
  item,
  sourceOf,
  canEdit,
  onRestore,
  onHistory,
}: LibraryDetailsProps) {
  const openFile = useIdeStore((s) => s.openFile)
  const summary = useMemo(() => (item ? manifestSummary(item, sourceOf) : null), [item, sourceOf])

  if (!item) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Pick a module or a node to see its details.
      </p>
    )
  }

  // The node.json name as edited; the item's own while that file has none to read.
  const manifestName = summary?.rows.find((row) => row.label === 'name')?.value
  const previewName = manifestName && manifestName !== '—' ? manifestName : item.name

  function handleEdit() {
    if (summary) openFile(summary.path)
  }

  function handleRestore(version: string) {
    onRestore(item!, version)
  }

  function handleHistory() {
    onHistory(item!)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-auto bg-card p-3.5"
      aria-label="Details"
    >
      <div className="flex items-center gap-2.5">
        <LibraryKindTile kind={item.kind} className="size-8 rounded-lg text-xs" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
          <span className="truncate text-2xs text-muted-foreground">
            {KIND_LABEL[item.kind]} · /{itemRoot(item)}
          </span>
        </div>
      </div>
      <DetailsSection
        label="Manifest"
        title={
          <span className="font-mono normal-case tracking-normal">
            {summary?.path ?? (item.kind === 'module' ? 'package.json' : 'node.json')}
          </span>
        }
        action={
          summary ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={handleEdit}
            >
              Edit
            </Button>
          ) : undefined
        }
        note={
          item.kind === 'module'
            ? 'Name, description and dependencies live in package.json. Edit the file to change them.'
            : 'Everything here is read from node.json. Edit the file to change it.'
        }
      >
        {summary ? (
          <dl className="overflow-hidden rounded-lg border border-border bg-background">
            {summary.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start gap-2.5 border-t border-border px-2.5 py-2 first:border-t-0"
              >
                <dt className="w-20 shrink-0 font-mono text-2xs leading-5 text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="min-w-0 flex-1 break-words font-mono text-xs leading-5 text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <DetailsEmpty>Loading…</DetailsEmpty>
        )}
      </DetailsSection>
      <VersionsSection
        item={item}
        canEdit={canEdit}
        onRestore={handleRestore}
        onHistory={handleHistory}
      />
      {item.kind === 'module' ? (
        <DetailsSection title="Dependencies" note="Resolved from package.json. Bundled at deploy.">
          {summary && summary.dependencies.length > 0 ? (
            <ul className="flex flex-col font-mono">
              {summary.dependencies.map((dep) => (
                <DotRow key={dep.name}>
                  <span className="min-w-0 flex-1 truncate text-foreground">{dep.name}</span>
                  <span className="text-muted-foreground">{dep.range}</span>
                </DotRow>
              ))}
            </ul>
          ) : (
            <DetailsEmpty>None.</DetailsEmpty>
          )}
        </DetailsSection>
      ) : (
        <DetailsSection title="How it looks on canvas" note="Drawn from configSchema.">
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <LibraryKindTile kind="node" className="size-6 rounded-md text-2xs" />
              <span className="truncate text-sm font-semibold text-foreground">{previewName}</span>
            </div>
            {summary?.configSchema && Object.keys(summary.configSchema).length > 0 ? (
              <DynamicFields
                configSchema={summary.configSchema}
                data={defaultsOf(summary.configSchema)}
                onChange={noop}
                readOnly
              />
            ) : (
              <DetailsEmpty>No settings.</DetailsEmpty>
            )}
          </div>
        </DetailsSection>
      )}
      <UsedBySection item={item} />
    </div>
  )
}
