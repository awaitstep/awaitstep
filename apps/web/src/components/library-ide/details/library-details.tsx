import { useMemo } from 'react'
import { useIdeStore } from '../../../stores/ide-store'
import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { itemRoot } from '../../../lib/library/ide-index'
import { manifestSummary } from '../../../lib/library/manifest-summary'
import { Button } from '../../ui/button'
import { DynamicFields } from '../../canvas/dynamic-fields'
import { KIND_LABEL } from '../../library/library-format'
import { DetailsSection } from './details-section'
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
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-card" aria-label="Details">
      <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
        {KIND_LABEL[item.kind]} · /{itemRoot(item)}
      </p>
      <DetailsSection
        title={item.kind === 'module' ? 'package.json' : 'node.json'}
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
            ? 'Name, version and dependencies live in package.json.'
            : 'Read from node.json. Edit the file to change it.'
        }
      >
        {summary ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {summary.rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="truncate font-mono text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </DetailsSection>
      <VersionsSection
        item={item}
        canEdit={canEdit}
        onRestore={handleRestore}
        onHistory={handleHistory}
      />
      {item.kind === 'module' ? (
        <DetailsSection title="Dependencies" note="From package.json. Bundled at deploy.">
          {summary && summary.dependencies.length > 0 ? (
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {summary.dependencies.map((dep) => (
                <li key={dep.name} className="flex gap-2">
                  <span className="flex-1 truncate text-foreground">{dep.name}</span>
                  <span className="text-muted-foreground">{dep.range}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">None.</p>
          )}
        </DetailsSection>
      ) : (
        <DetailsSection title="How it looks on canvas" note="Drawn from configSchema.">
          {summary?.configSchema && Object.keys(summary.configSchema).length > 0 ? (
            <DynamicFields
              configSchema={summary.configSchema}
              data={defaultsOf(summary.configSchema)}
              onChange={noop}
              readOnly
            />
          ) : (
            <p className="text-xs text-muted-foreground">No settings.</p>
          )}
        </DetailsSection>
      )}
      <UsedBySection item={item} />
    </div>
  )
}
