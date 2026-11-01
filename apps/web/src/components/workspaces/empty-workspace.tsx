import { Share2, ShieldCheck } from 'lucide-react'
import { useSharedWithWorkspace } from '../../data/dashboard/items'
import { useProjectSetup } from '../../data/dashboard/setup'
import { useWorkspacePeople } from '../../data/dashboard/workspaces'
import {
  projectPagePath,
  workspacePath,
  workspaceSettingsPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import { AvatarStack } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { buttonVariants } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { SectionHeader } from '../ui/section-header'
import { ShellLink } from '../ui/shell-link'
import { ScopeChip } from '../ui/workspace-dot'
import { NewItemButton } from '../items/item-actions'
import { AvailableCard } from './parts/available-card'
import { FannedTiles } from './parts/fanned-tiles'

interface EmptyWorkspaceProps {
  slugs: WorkspaceSlugs
  workspaceName: string
  projectName: string
  readOnly: boolean
}

/** The `EmptyWorkspace` board: nothing built yet, and what the workspace already has. */
export function EmptyWorkspace({
  slugs,
  workspaceName,
  projectName,
  readOnly,
}: EmptyWorkspaceProps) {
  const people = useWorkspacePeople(slugs)
  const setup = useProjectSetup(slugs.org, slugs.project)
  const shared = useSharedWithWorkspace(slugs)

  const projectAdmins = (people.data ?? [])
    .filter((p) => p.inherited && p.role === 'admin')
    .map((p) => p.person)
  const variables = setup.data ? setup.data.orgVariables + setup.data.projectVariables : null
  const importHref = `${workspacePath(slugs, 'workflows')}?new=import`
  const heroActions = readOnly ? null : (
    <>
      <NewItemButton slugs={slugs} kind="workflow" size="default" />
      <NewItemButton slugs={slugs} kind="script" size="default" variant="outline" />
      <ShellLink href={importHref} className={buttonVariants({ variant: 'outline' })}>
        Import
      </ShellLink>
    </>
  )

  return (
    <>
      <EmptyState
        icon={<FannedTiles />}
        size="lg"
        tone="welcome"
        headingLevel={1}
        title={`Nothing in ${workspaceName} yet`}
        description={`Only people with access to ${workspaceName} will see what you build here. Share it later if another workspace should call it.`}
        actions={heroActions}
      />
      <SectionHeader
        title={`Already available in ${workspaceName}`}
        caption="You’re not starting from scratch"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AvailableCard
          href={workspaceSettingsPath(slugs, 'members')}
          icon={ShieldCheck}
          tone="info"
          title={`Inherited from ${projectName}`}
          subtitle="Applies here automatically"
          cta={`Add people only to ${workspaceName}`}
        >
          <span className="flex flex-col gap-2.5">
            {projectAdmins.length > 0 && (
              <span className="flex items-center gap-2.5 text-xs text-foreground/90">
                <AvatarStack people={projectAdmins} />
                {plural(projectAdmins.length, 'project admin')}
              </span>
            )}
            {setup.data && (
              <span className="flex flex-wrap gap-1.5">
                <Badge variant="default" className="font-normal">
                  {plural(setup.data.projectKeys, 'project key')}
                </Badge>
                <Badge variant="default" className="font-normal">
                  {plural(variables ?? 0, 'variable')}
                </Badge>
              </span>
            )}
          </span>
        </AvailableCard>
        <AvailableCard
          // The board links Workflows, which is this page while it's empty; the
          // project's Shared library lists the same items.
          href={projectPagePath(slugs, 'shared')}
          icon={Share2}
          tone="ok"
          title={`Shared with ${workspaceName}`}
          subtitle="Call these from your workflows"
          cta="See shared items"
        >
          <span className="flex flex-wrap gap-1.5">
            {(shared.data ?? []).map((item) => (
              <ScopeChip key={item.id} colour={item.from.colour}>
                {item.name} · {item.from.name}
              </ScopeChip>
            ))}
            {shared.data?.length === 0 && (
              <span className="text-xs text-muted-foreground">
                Nothing shared in {projectName} yet
              </span>
            )}
          </span>
        </AvailableCard>
      </div>
    </>
  )
}
