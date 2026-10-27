import { Braces, Plus, Share2, Users } from 'lucide-react'
import { useProjectShared } from '../../data/dashboard/items'
import { useProjectMembers } from '../../data/dashboard/members'
import { useProjectSetup } from '../../data/dashboard/setup'
import { useProjectVariables } from '../../data/dashboard/variables'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { projectSettingsPath, workspacePath, type ProjectSlugs } from '../../lib/dashboard-paths'
import { plural, pluralNoun } from '../../lib/plural'
import { isNew } from '../../lib/time'
import { ActionCard } from '../ui/action-card'
import { AvatarStack } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SectionHeader } from '../ui/section-header'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { ScopeChip } from '../ui/workspace-dot'
import { PageBody, PageIntro } from '../shell/page-intro'
import { pickWorkspace } from '../navigation/land-in-workspace'
import { recentWorkspaces } from '../navigation/scope-memory'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { WorkspaceCard } from '../workspaces/parts/workspace-card'
import { NewWorkspaceDialog } from './new-workspace-dialog'
import { ProjectPoolCard } from './parts/project-pool-card'
import { projectAdmins } from './project-pool'
import { useProjectScope } from './use-project-scope'

const CHIPS_SHOWN = 2

interface WorkspacesPageProps {
  slugs: ProjectSlugs
  /** `?new=workspace` opens the New workspace dialog. */
  dialogOpen: boolean
  onDialogChange: (open: boolean) => void
}

function PoolSkeleton() {
  return (
    <LoadingRegion label="Loading the project pool">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Bone key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </LoadingRegion>
  )
}

function MoreChip({ count }: { count: number }) {
  if (count <= 0) return null
  return <Badge className="font-normal text-muted-foreground">+{count}</Badge>
}

/** `/{org}/{project}/settings/workspaces` (`ProjectOverview`): the workspaces, and what every one inherits. */
export function WorkspacesPage({ slugs, dialogOpen, onDialogChange }: WorkspacesPageProps) {
  const scope = useProjectScope(slugs)
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const members = useProjectMembers(slugs.org, slugs.project)
  const setup = useProjectSetup(slugs.org, slugs.project)
  const variables = useProjectVariables(slugs.org, slugs.project)
  const shared = useProjectShared(slugs.org, slugs.project)

  if (!scope) return null
  const project = scope.project.project
  const org = { slug: slugs.org, name: scope.org.org.name }
  const canCreate = scope.project.viewerCan.createWorkspace
  const pool = [members, setup, variables, shared]
  const recent = recentWorkspaces(slugs.org, slugs.project)
  const landing = pickWorkspace(
    (workspaces.data ?? []).map((w) => w.slug),
    recent,
  )
  // "You're here" only for a workspace actually opened, never the first-one fallback (D-P3-2).
  const here = landing !== null && recent.includes(landing) ? landing : null

  function handleNew() {
    onDialogChange(true)
  }

  function handleRetryWorkspaces() {
    void workspaces.refetch()
  }

  function handleRetry() {
    for (const query of pool) {
      if (query.isError) void query.refetch()
    }
  }

  let workspaceGrid
  if (workspaces.isError) {
    workspaceGrid = (
      <WorkspaceLoadError
        what="the workspaces"
        error={workspaces.error}
        onRetry={handleRetryWorkspaces}
        retrying={workspaces.isFetching}
      />
    )
  } else if (!workspaces.data) {
    workspaceGrid = (
      <LoadingRegion label="Loading workspaces">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Bone key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </LoadingRegion>
    )
  } else {
    workspaceGrid = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.data.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            href={workspacePath({ ...slugs, workspace: workspace.slug })}
            current={workspace.slug === here}
            isNew={isNew(workspace.createdAt)}
          />
        ))}
        {canCreate.allowed && (
          <ActionCard
            onSelect={handleNew}
            icon={Plus}
            tone="ok"
            title="New workspace"
            description="Give another team its own people, keys and workflows"
            variant="dashed"
          />
        )}
      </div>
    )
  }

  const failed = pool.find((query) => query.isError)
  let poolBody
  if (failed) {
    poolBody = (
      <WorkspaceLoadError
        what="the project pool"
        error={failed.error}
        onRetry={handleRetry}
        retrying={pool.some((query) => query.isFetching)}
      />
    )
  } else if (!members.data || !setup.data || !variables.data || !shared.data) {
    poolBody = <PoolSkeleton />
  } else {
    const admins = projectAdmins(members.data)
    const own = variables.data.filter((v) => v.setAt.level === 'project').length
    // The count is the big number; the caption carries only its noun.
    const sharedCaption = `${pluralNoun(shared.data.length, 'item')} any workspace can use`
    poolBody = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ProjectPoolCard
          href={projectSettingsPath(slugs, 'members')}
          icon={Users}
          tone="info"
          title="Members & keys"
          count={admins.length}
          caption="admins open every workspace"
        >
          <span className="flex items-center gap-2.5">
            <AvatarStack people={admins} />
            <Badge className="font-normal">{plural(setup.data.projectKeys, 'project key')}</Badge>
          </span>
        </ProjectPoolCard>
        <ProjectPoolCard
          href={projectSettingsPath(slugs, 'variables')}
          icon={Braces}
          tone="warn"
          title="Variables"
          count={variables.data.length}
          caption={`${own} project · ${variables.data.length - own} from ${org.name}`}
        >
          <span className="flex flex-wrap gap-1.5">
            {variables.data.slice(0, CHIPS_SHOWN).map((v) => (
              <Badge key={v.name} className="rounded-md font-mono font-normal">
                {v.name}
              </Badge>
            ))}
            <MoreChip count={variables.data.length - CHIPS_SHOWN} />
          </span>
        </ProjectPoolCard>
        <ProjectPoolCard
          href={projectSettingsPath(slugs, 'shared')}
          icon={Share2}
          tone="ok"
          title="Shared library"
          count={shared.data.length}
          caption={sharedCaption}
        >
          <span className="flex flex-wrap gap-1.5">
            {shared.data.slice(0, CHIPS_SHOWN).map((item) => (
              <ScopeChip key={item.id} colour={item.from.colour}>
                {item.name} · {item.from.name}
              </ScopeChip>
            ))}
            <MoreChip count={shared.data.length - CHIPS_SHOWN} />
          </span>
        </ProjectPoolCard>
      </div>
    )
  }

  return (
    <>
      {canCreate.allowed && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleNew}>
            New workspace
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Workspaces"
          description="Each workspace keeps a team’s workflows, people and keys apart. Anything in the project pool below is available in every workspace."
        />
        {workspaceGrid}
        <section className="flex flex-col gap-3.5">
          <SectionHeader
            title="Project pool"
            caption={`Inherited by every workspace in ${project.name}. A workspace can add its own on top, never remove these.`}
          />
          {poolBody}
        </section>
      </PageBody>
      {dialogOpen && canCreate.allowed && (
        <NewWorkspaceDialog
          open
          onOpenChange={onDialogChange}
          slugs={slugs}
          org={org}
          projectName={project.name}
        />
      )}
    </>
  )
}
