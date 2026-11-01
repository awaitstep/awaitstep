import { useOrgActivity } from '../../data/dashboard/activity'
import { useProjects } from '../../data/dashboard/projects'
import { useFailingNow } from '../../data/dashboard/runs'
import { useScope } from '../../data/dashboard/workspaces'
import { ListCardSkeleton, LoadingRegion, Bone } from '../ui/skeletons'
import { LoadError } from '../ui/load-error'
import { PageBody } from '../shell/page-intro'
import { recentProjects } from '../navigation/scope-memory'
import { EmptyOrg } from './empty-org'
import { NewProjectDialog } from './new-project-dialog'
import { OrgHome } from './org-home'

interface OrgHomePageProps {
  org: string
  /** `?new=project` opens the New project dialog. */
  dialog: string | undefined
  then: string | undefined
  onCloseDialog: () => void
}

function OrgHomeSkeleton() {
  return (
    <PageBody>
      <LoadingRegion label="Loading projects">
        <div aria-hidden="true" className="flex flex-wrap items-end gap-5">
          <Bone className="h-8 w-40" />
          <span className="ml-auto hidden gap-2.5 md:flex">
            <Bone className="h-14 w-28 rounded-xl" />
            <Bone className="h-14 w-28 rounded-xl" />
            <Bone className="h-14 w-28 rounded-xl" />
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Bone className="h-44 rounded-2xl" />
          <Bone className="h-44 rounded-2xl" />
          <Bone className="h-44 rounded-2xl" />
        </div>
        <ListCardSkeleton rows={3} />
      </LoadingRegion>
    </PageBody>
  )
}

/** `/{org}/projects`: the org home, or the welcome for an org with no project yet. */
export function OrgHomePage({ org, dialog, then, onCloseDialog }: OrgHomePageProps) {
  const scope = useScope({ org })
  const projects = useProjects(org)
  const failing = useFailingNow(org)
  const activity = useOrgActivity(org)

  function handleRetry() {
    for (const query of [projects, failing, activity]) {
      if (query.isError) void query.refetch()
    }
  }

  function handleDialogChange(open: boolean) {
    if (!open) onCloseDialog()
  }

  const orgScope = scope.data?.found ? scope.data.org : null
  if (!orgScope) return null
  const orgInfo = { slug: org, name: orgScope.org.name, initial: orgScope.org.initial }
  const canCreate = orgScope.viewerCan.createProject.allowed

  let page
  if (projects.isError || failing.isError || activity.isError) {
    page = (
      <PageBody>
        <LoadError
          title="We couldn’t load your projects"
          detail="Nothing was changed. Your deployed workflows keep running."
          onRetry={handleRetry}
          retrying={projects.isFetching || failing.isFetching || activity.isFetching}
        />
      </PageBody>
    )
  } else if (!projects.data || !failing.data || !activity.data) {
    page = <OrgHomeSkeleton />
  } else if (projects.data.length === 0) {
    page = <EmptyOrg org={orgInfo} />
  } else {
    const current = recentProjects(org).find((slug) =>
      projects.data.some((project) => project.slug === slug),
    )
    page = (
      <OrgHome
        org={orgInfo}
        projects={projects.data}
        failing={failing.data}
        activity={activity.data}
        currentProject={current ?? null}
        canCreateProject={canCreate}
      />
    )
  }

  return (
    <>
      {page}
      {dialog === 'project' && canCreate && (
        <NewProjectDialog
          open
          onOpenChange={handleDialogChange}
          org={orgInfo}
          then={then === 'import' ? 'import' : undefined}
        />
      )}
    </>
  )
}
