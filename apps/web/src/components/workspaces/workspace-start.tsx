import type { ReactNode } from 'react'
import { Cloud, Plus, Share2, Users, type LucideIcon } from 'lucide-react'
import { useCreateItem } from '../../data/dashboard/items'
import { useProjectConnections } from '../../data/dashboard/org-settings'
import { useViewer } from '../../data/dashboard/session'
import {
  orgPath,
  withNewDialog,
  workspacePath,
  workspaceSettingsPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import type { SharedItem } from '../../types/dashboard/items'
import type { Workspace } from '../../types/dashboard/workspaces'
import { ShellLink } from '../ui/shell-link'
import { Bone } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import {
  deploysSentence,
  peopleSentence,
  reuseSentence,
  sharedSentence,
} from './workspace-start-copy'

const CARD =
  'flex flex-col gap-3 rounded-xl border border-border bg-background p-[18px] text-left transition-colors hover:border-foreground/20 disabled:opacity-60'

interface StartCardBodyProps {
  icon: LucideIcon
  title: string
  body: string
  cta: string
}

function StartCardBody({ icon: Icon, title, body, cta }: StartCardBodyProps) {
  return (
    <>
      <Tile tone="ok">
        <Icon />
      </Tile>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>{' '}
        <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
      <span className="mt-auto text-xs font-medium text-status-success">{cta}</span>
    </>
  )
}

function BlankCard({ slugs }: { slugs: WorkspaceSlugs }) {
  const create = useCreateItem(slugs)

  function handleClick() {
    create.mutate({ kind: 'workflow' })
  }

  return (
    // A second click while the first is in flight would make a second draft.
    <button type="button" className={CARD} onClick={handleClick} disabled={create.isPending}>
      <StartCardBody
        icon={Plus}
        title="Start from blank"
        body="An empty canvas with a webhook trigger already wired, ready for your first step."
        cta="New workflow →"
      />
    </button>
  )
}

interface SummaryRowProps {
  icon: LucideIcon
  label: string
  children: ReactNode
  /** The link at the right; none for someone who can't act on it. */
  href?: string
  action: string
}

function SummaryRow({ icon: Icon, label, children, href, action }: SummaryRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="w-[132px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-[160px] flex-1 text-sm text-foreground">{children}</span>
      {href && (
        <ShellLink href={href} className="text-xs font-medium text-status-success">
          {action}
        </ShellLink>
      )}
    </li>
  )
}

interface WorkspaceStartProps {
  slugs: WorkspaceSlugs
  workspace: Workspace
  projectName: string
  sharedIn: SharedItem[]
  readOnly: boolean
  /** Whether the viewer may connect or change Cloudflare accounts (org owners and admins). */
  canManageConnections: boolean
}

/**
 * `WsOverview`'s New state: nothing built yet, so the ways to start, then who
 * can open the workspace, where it deploys and what is shared.
 */
export function WorkspaceStart({
  slugs,
  workspace,
  projectName,
  sharedIn,
  readOnly,
  canManageConnections,
}: WorkspaceStartProps) {
  const viewer = useViewer()
  const connections = useProjectConnections(slugs.org, slugs.project)
  const libraryHref = workspacePath(slugs, 'library')
  const deploys = connections.data ? deploysSentence(connections.data, projectName) : undefined
  const deploysAction = deploys === null ? 'Connect' : 'Change'
  const connectionsHref =
    deploys === null
      ? withNewDialog(orgPath(slugs.org, 'connections'), 'connection')
      : orgPath(slugs.org, 'connections')

  let deploysLine: ReactNode
  if (connections.isError) deploysLine = 'Couldn’t load the Cloudflare accounts'
  else if (deploys === undefined) deploysLine = <Bone className="h-4 w-48" />
  else deploysLine = deploys ?? `No Cloudflare account deploys ${projectName} yet`

  return (
    <>
      <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {readOnly ? `Nothing in ${workspace.name} yet` : `Start building in ${workspace.name}`}
          </h2>
          <span className="flex-1 text-xs text-muted-foreground">
            {readOnly ? 'You can open it, but not add to it' : 'Nothing here yet'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3.5 p-5 md:grid-cols-2">
          {!readOnly && <BlankCard slugs={slugs} />}
          <ShellLink href={libraryHref} className={CARD}>
            <StartCardBody
              icon={Share2}
              title="Reuse what the project shares"
              body={reuseSentence(sharedIn, projectName)}
              cta="Open the library →"
            />
          </ShellLink>
        </div>
      </section>

      <ul
        aria-label={`About ${workspace.name}`}
        className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
      >
        <SummaryRow
          icon={Users}
          label="People"
          href={workspaceSettingsPath(slugs, 'members')}
          action="Manage"
        >
          {peopleSentence(workspace.people, viewer.data?.id, workspace.name)}
        </SummaryRow>
        <SummaryRow
          icon={Cloud}
          label="Deploys to"
          href={canManageConnections ? connectionsHref : undefined}
          action={deploysAction}
        >
          {deploysLine}
        </SummaryRow>
        <SummaryRow icon={Share2} label="Shared" href={libraryHref} action="Library">
          {sharedSentence(sharedIn.length, workspace.counts.sharedOut)}
        </SummaryRow>
      </ul>
    </>
  )
}
