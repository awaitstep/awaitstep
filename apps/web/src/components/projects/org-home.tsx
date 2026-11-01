import { useEffect, useRef, useState, type RefObject } from 'react'
import { Plus } from 'lucide-react'
import { orgPath, projectWorkspacesPath, workspacePath } from '../../lib/dashboard-paths'
import { currentFirst } from '../../lib/current-first'
import { timeAgoOrDay } from '../../lib/time'
import type { ActivityItem } from '../../types/dashboard/activity'
import type { Project } from '../../types/dashboard/projects'
import type { FailingItem } from '../../types/dashboard/runs'
import { ActionCard } from '../ui/action-card'
import { buttonVariants } from '../ui/button'
import { SearchField } from '../ui/search-field'
import { ShellLink } from '../ui/shell-link'
import { StatTile } from '../ui/tile'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { ProjectCard } from './parts/project-card'
import { filterProjects } from './project-search'
import { RecentActivity } from './recent-activity'

interface OrgHomeProps {
  org: { slug: string; name: string }
  projects: Project[]
  failing: FailingItem[]
  activity: ActivityItem[]
  /** The project you'd land in, marked "Current". */
  currentProject: string | null
  canCreateProject: boolean
}

function failingHref(org: string, item: FailingItem): string {
  return workspacePath({ org, project: item.project.slug, workspace: item.workspace.slug }, 'runs')
}

/** ⌘K / Ctrl+K focuses the search field, as its hint says. */
function useFocusShortcut(target: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      target.current?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [target])
}

/** The org home: what's here, how it's doing, and what happened lately. */
export function OrgHome({
  org,
  projects,
  failing,
  activity,
  currentProject,
  canCreateProject,
}: OrgHomeProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useFocusShortcut(searchRef)

  const shown = filterProjects(projects, query)
  const deployed = projects.reduce((sum, project) => sum + project.health.deployed, 0)
  const newProjectHref = `${orgPath(org.slug)}?new=project`
  const firstFailing = failing[0]

  const newProjectButton = canCreateProject && (
    <ShellLink href={newProjectHref} className={buttonVariants({ size: 'sm' })}>
      <Plus aria-hidden="true" />
      New project
    </ShellLink>
  )

  return (
    <>
      <TopBarContent>
        <SearchField
          ref={searchRef}
          label="Search projects and workspaces"
          placeholder="Search projects and workspaces"
          value={query}
          onChange={setQuery}
          shortcut={{ hint: '⌘K', keys: 'Meta+K' }}
        />
        {newProjectButton}
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Projects"
          description="Open a project to work in its workspaces."
          aside={
            <>
              <span className="hidden flex-wrap gap-2.5 md:flex">
                <StatTile value={projects.length} label="Projects" />
                <StatTile value={deployed} label="Workflows deployed" />
                <StatTile
                  value={failing.length}
                  label="Failing now"
                  tone={failing.length > 0 ? 'danger' : undefined}
                  href={firstFailing ? failingHref(org.slug, firstFailing) : undefined}
                />
              </span>
              <span className="md:hidden">{newProjectButton}</span>
            </>
          }
        />
        <div className="flex flex-col gap-3 md:hidden">
          {firstFailing && (
            <ShellLink
              href={failingHref(org.slug, firstFailing)}
              className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-tone-fail px-3.5 py-3 text-sm"
            >
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-status-error" />
              <span className="min-w-0 flex-1">
                <strong className="font-semibold">{firstFailing.item.name}</strong> is failing
              </span>
              <span className="text-2xs text-status-error">
                {firstFailing.workspace.name} · {timeAgoOrDay(firstFailing.run.createdAt)}
              </span>
            </ShellLink>
          )}
          <SearchField
            label="Search projects"
            placeholder="Search projects"
            value={query}
            onChange={setQuery}
          />
        </div>
        <ul
          aria-label="Projects"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        >
          {currentFirst(shown, (project) => project.slug === currentProject).map((project) => (
            // min-w-0 at each level: a grid or flex item won't shrink below its
            // content otherwise, and a long card spills into the next column.
            <li key={project.id} className="flex min-w-0">
              <div className="min-w-0 flex-1 [&>a]:h-full">
                <ProjectCard
                  project={project}
                  href={projectWorkspacesPath({ org: org.slug, project: project.slug })}
                  current={project.slug === currentProject}
                />
              </div>
            </li>
          ))}
          {canCreateProject && !query && (
            <li className="flex min-w-0 [&>a]:min-w-0 [&>a]:flex-1">
              <ActionCard
                href={newProjectHref}
                icon={Plus}
                tone="ok"
                title="New project"
                description="Comes with a Default workspace. Add more as teams need them."
                variant="dashed"
              />
            </li>
          )}
        </ul>
        {shown.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No project or workspace matches “{query.trim()}”.
          </p>
        )}
        <RecentActivity org={org.slug} items={activity} />
      </PageBody>
    </>
  )
}
