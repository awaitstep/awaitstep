import { Download, FolderPlus, Plug, Plus, Users } from 'lucide-react'
import { orgPath, orgSettingsPath } from '../../lib/dashboard-paths'
import { ActionCard } from '../ui/action-card'
import { buttonVariants } from '../ui/button'
import { ProgressMeter } from '../ui/progress-meter'
import { ShellLink } from '../ui/shell-link'
import { PageBody } from '../shell/page-intro'

interface EmptyOrgProps {
  org: { slug: string; name: string; initial: string }
}

/** The org → project → workspace sketch beside the welcome. Decorative. */
function ScopeSketch({ org }: EmptyOrgProps) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-1 basis-[340px] flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-lg"
    >
      <span className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-2xs font-semibold text-primary-foreground">
          {org.initial}
        </span>
        <span className="flex-1 text-sm font-medium">{org.name}</span>
        <span className="text-2xs text-muted-foreground">Organization</span>
      </span>
      <span className="ml-5 flex items-center gap-2.5 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-muted text-2xs font-semibold">
          P
        </span>
        <span className="flex-1 text-sm font-medium text-status-success">Your first project</span>
        <span className="text-2xs text-status-success">Next</span>
      </span>
      <span className="ml-11 flex gap-2">
        <span className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
          <span className="flex size-4.5 items-center justify-center rounded bg-workspace-green text-3xs font-semibold text-workspace-green-foreground">
            D
          </span>
          Default
        </span>
        <span className="flex flex-1 items-center rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
          + Team workspace
        </span>
      </span>
    </div>
  )
}

/**
 * A new org with no project yet: what a project is, how to start one, and the
 * three steps to get the org ready. Steps 2–3 read as not done until P5 brings
 * connections and members.
 */
export function EmptyOrg({ org }: EmptyOrgProps) {
  const newProject = `${orgPath(org.slug)}?new=project`
  return (
    <PageBody>
      <section className="flex flex-wrap items-center gap-10 rounded-2xl border border-primary/20 bg-primary/5 p-8 md:p-10">
        <div className="flex flex-1 basis-[360px] flex-col gap-5">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-tone-ok px-2.5 py-1 text-xs text-status-success">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-success" />
            Welcome to {org.name}
          </span>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Start with a project.
            <br />
            Everything else lives inside it.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            A project holds your workflows. It comes with a workspace to build in. Add more
            workspaces later when teams need to keep their work apart.
          </p>
          <span className="flex flex-wrap gap-2.5">
            <ShellLink href={newProject} className={buttonVariants({ size: 'lg' })}>
              <Plus aria-hidden="true" />
              Create your first project
            </ShellLink>
            {/* Import needs somewhere to import into: a project comes first (D-P1-4). */}
            <ShellLink
              href={`${newProject}&then=import`}
              className={buttonVariants({ size: 'lg', variant: 'outline' })}
            >
              <Download aria-hidden="true" />
              Import a workflow
            </ShellLink>
          </span>
        </div>
        <ScopeSketch org={org} />
      </section>

      <section aria-labelledby="get-ready" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="get-ready" className="text-base font-semibold">
            Get {org.name} ready
          </h2>
          <ProgressMeter done={0} total={3} label={`Get ${org.name} ready`} />
        </div>
        <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          <li className="flex min-w-0 [&>a]:min-w-0 [&>a]:flex-1">
            <ActionCard
              href={newProject}
              icon={FolderPlus}
              tone="ok"
              title="Create a project"
              description="Where your workflows will live"
              corner="Step 1"
              highlighted
            />
          </li>
          <li className="flex min-w-0 [&>a]:min-w-0 [&>a]:flex-1">
            <ActionCard
              href={orgSettingsPath(org.slug, 'connections')}
              icon={Plug}
              tone="warn"
              title="Connect Cloudflare"
              description="Needed to deploy. You can build first"
              corner="Step 2"
            />
          </li>
          <li className="flex min-w-0 [&>a]:min-w-0 [&>a]:flex-1">
            <ActionCard
              href={orgSettingsPath(org.slug, 'members')}
              icon={Users}
              tone="info"
              title="Invite your team"
              description="Choose which projects each person sees"
              corner="Optional"
            />
          </li>
        </ul>
      </section>
    </PageBody>
  )
}
