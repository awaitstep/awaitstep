import { useState } from 'react'
import { plural } from '../../lib/plural'
import { useInstallNode, useUninstallNode, useUpdateNode } from '../../data/dashboard/resources'
import type { OrgNode } from '../../types/dashboard/resources'
import { Banner } from '../ui/banner'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { SearchField } from '../ui/search-field'
import { SearchableSelect } from '../ui/searchable-select'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { CatalogNodeCard } from './parts/catalog-node-card'
import {
  filterNodes,
  categoryOptions,
  showCounts,
  type NodeCategory,
  type NodeShow,
} from './node-filter'

interface NodesTabProps {
  org: { slug: string; name: string }
  nodes: OrgNode[]
  /** Org owners and admins install, update and uninstall; everyone else looks. */
  canManage: boolean
  /** Why someone can't, for the notice. */
  reason?: string
}

/** Resources → Nodes (`OrgResources`): filters, then Installed and Available cards. */
export function NodesTab({ org, nodes, canManage, reason }: NodesTabProps) {
  const install = useInstallNode(org.slug)
  const uninstall = useUninstallNode(org.slug)
  const update = useUpdateNode(org.slug)
  const [show, setShow] = useState<NodeShow>('all')
  const [category, setCategory] = useState<NodeCategory>('All')
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState<OrgNode | null>(null)

  const counts = showCounts(nodes)
  const categories = categoryOptions(nodes)
  const { installed, available } = filterNodes(nodes, { show, category, search })
  const changing = [install, uninstall, update].find((m) => m.isPending)
  // One change at a time: a second one would replace the first's progress and error.
  const pending = changing?.variables
  const failed = [install, uninstall, update].find((m) => m.isError)?.error

  function resetErrors() {
    install.reset()
    uninstall.reset()
    update.reset()
  }

  function handleInstall(nodeId: string) {
    resetErrors()
    install.mutate(nodeId)
  }

  function handleUpdate(nodeId: string) {
    resetErrors()
    update.mutate(nodeId)
  }

  function handleUninstall(nodeId: string) {
    resetErrors()
    const node = nodes.find((n) => n.id === nodeId)
    // In use: say what happens to those workflows first.
    if (node?.usage) setConfirming(node)
    else uninstall.mutate(nodeId)
  }

  function handleConfirmOpenChange(open: boolean) {
    if (!open) setConfirming(null)
  }

  function handleConfirmUninstall() {
    if (!confirming) return
    uninstall.mutate(confirming.id, { onSuccess: () => setConfirming(null) })
  }

  const showOptions: FilterOption<NodeShow>[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'installed', label: 'Installed', count: counts.installed },
    { id: 'available', label: 'Available', count: counts.available },
  ]
  const actions = canManage
    ? { onInstall: handleInstall, onUninstall: handleUninstall, onUpdate: handleUpdate }
    : {}
  const term = search.trim()
  // A filter that hides everything says which filter; otherwise the section is just empty.
  const filtered = term
    ? `No nodes match “${term}”.`
    : category !== 'All'
      ? `No ${category} nodes.`
      : null

  function cards(list: OrgNode[], emptyText: string) {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground">{filtered ?? emptyText}</p>
    }
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((node) => (
          <CatalogNodeCard
            key={node.id}
            node={node}
            orgName={org.name}
            busy={pending === node.id}
            disabled={changing !== undefined}
            {...actions}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {!canManage && reason && (
        <div className="max-w-sm">
          <Banner tone="warn">{reason}</Banner>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-xs text-status-error">
          {failed.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          label="Search nodes"
          placeholder="Search nodes"
          value={search}
          onChange={setSearch}
        />
        <SegmentedFilter label="Show" options={showOptions} value={show} onChange={setShow} />

        <SearchableSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={categories}
          searchPlaceholder="Search categories"
          emptyText="No category matches."
          className="flex-1 sm:flex-none ml-auto"
        />
      </div>
      {installed && (
        <section aria-labelledby="installed-nodes" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 id="installed-nodes" className="text-base font-semibold">
              Installed
            </h2>
            <span className="text-xs text-muted-foreground">
              {counts.installed} · in every project’s palette
            </span>
          </div>
          {cards(installed, 'No nodes installed yet.')}
        </section>
      )}
      {available && (
        <section aria-labelledby="available-nodes" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 id="available-nodes" className="text-base font-semibold">
              Available from the marketplace
            </h2>
            <span className="text-xs text-muted-foreground">
              {counts.available} · installing adds it to every project, and workflows pin the
              version they use
            </span>
          </div>
          {cards(available, 'Nothing more to install.')}
        </section>
      )}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={handleConfirmOpenChange}
          title={`Uninstall ${confirming.name}?`}
          description={`Used in ${plural(confirming.usage ?? 0, 'workflow')}. Deployed versions keep running, but the next deploy fails until you reinstall the node or remove it from those workflows.`}
          cancelLabel="Keep installed"
          confirmLabel="Uninstall anyway"
          variant="destructive"
          loading={uninstall.isPending}
          onConfirm={handleConfirmUninstall}
        />
      )}
    </>
  )
}
