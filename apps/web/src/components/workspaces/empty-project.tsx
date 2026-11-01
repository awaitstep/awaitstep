import { Check, Code, Plus, Upload, Workflow } from 'lucide-react'
import { useCreateItem } from '../../data/dashboard/items'
import { useProjectSetup } from '../../data/dashboard/setup'
import {
  orgPath,
  projectMembersAddPath,
  projectSettingsPath,
  workspacePath,
  withNewDialog,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { isNew } from '../../lib/time'
import { cn } from '../../lib/utils'
import type { Project } from '../../types/dashboard/projects'
import type { Workspace } from '../../types/dashboard/workspaces'
import { ActionCard } from '../ui/action-card'
import { Badge } from '../ui/badge'
import { buttonVariants } from '../ui/button'
import { ProgressMeter } from '../ui/progress-meter'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { WORKSPACE_TILE_CLASS } from '../ui/workspace-colour'

interface SetupStep {
  label: string
  done: boolean
  href: string
  caption?: string
}

function SetupRow({ step }: { step: SetupStep }) {
  const mark = step.done ? (
    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-3.5" aria-hidden="true" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="size-[22px] shrink-0 rounded-full border-[1.5px] border-muted-foreground/50"
    />
  )
  if (step.done) {
    return (
      <li className="flex items-center gap-3 py-2.5 text-sm">
        {mark}
        <span className="flex-1 text-muted-foreground line-through">{step.label}</span>
        <span className="sr-only">Done</span>
      </li>
    )
  }
  return (
    <li>
      <ShellLink
        href={step.href}
        className="flex items-center gap-3 py-2.5 text-sm hover:underline"
      >
        {mark}
        <span className="flex-1 text-foreground">{step.label}</span>
        {step.caption && <span className="text-2xs text-muted-foreground">{step.caption}</span>}
      </ShellLink>
    </li>
  )
}

interface EmptyProjectProps {
  slugs: WorkspaceSlugs
  org: { name: string }
  project: Project
  workspace: Workspace
  readOnly: boolean
  canAddWorkspace: boolean
}

/** The `EmptyProject` board: a project's only workspace, still empty. */
export function EmptyProject({
  slugs,
  org,
  project,
  workspace,
  readOnly,
  canAddWorkspace,
}: EmptyProjectProps) {
  const setup = useProjectSetup(slugs.org, slugs.project)
  const create = useCreateItem(slugs)
  const newProject = isNew(project.createdAt)

  function handleNewWorkflow() {
    create.mutate({ kind: 'workflow' })
  }

  function handleNewFunction() {
    create.mutate({ kind: 'script' })
  }

  const others = project.people.length - 1
  const steps: SetupStep[] = setup.data
    ? [
        {
          label: setup.data.cloudflareConnected ? 'Cloudflare connected' : 'Connect Cloudflare',
          done: setup.data.cloudflareConnected,
          href: withNewDialog(orgPath(slugs.org, 'connections'), 'connection'),
        },
        {
          label: 'Add project variables',
          done: setup.data.projectVariables > 0,
          href: projectSettingsPath(slugs, 'variables'),
          caption:
            setup.data.orgVariables > 0
              ? `${setup.data.orgVariables} inherited from ${org.name}`
              : undefined,
        },
        {
          label: 'Invite teammates',
          done: others > 0,
          // Into this project's Members, Add people open: not org Settings.
          href: projectMembersAddPath(slugs),
          caption: 'Only you so far',
        },
      ]
    : []
  const done = steps.filter((step) => step.done).length

  return (
    <>
      <section className="flex flex-col gap-6 rounded-2xl border border-status-success/20 bg-tone-ok/40 p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Tile tone="neutral" className="size-13 rounded-[14px] text-xl">
            {project.initial}
          </Tile>
          <span className="flex min-w-[260px] flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">{project.name} is ready</h1>
              {newProject && (
                <Badge variant="success" dot>
                  New project
                </Badge>
              )}
            </span>
            <span className="text-sm text-muted-foreground">
              You’re in its {workspace.name} workspace. Build your first workflow or function to get
              going.
            </span>
          </span>
        </div>
        {!readOnly && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <ActionCard
              onSelect={handleNewWorkflow}
              disabled={create.isPending}
              icon={Workflow}
              tone="ok"
              title="New workflow"
              description="Durable steps that retry, wait and resume"
              cta="Start building"
              highlighted
            />
            <ActionCard
              onSelect={handleNewFunction}
              disabled={create.isPending}
              icon={Code}
              tone="info"
              title="New function"
              description="A plain request handler, no steps"
              cta="Create function"
            />
            <ActionCard
              href={`${workspacePath(slugs, 'workflows')}?new=import`}
              icon={Upload}
              tone="warn"
              title="Import"
              description="Bring in a workflow file you exported"
              cta="Choose a file"
            />
          </div>
        )}
        {create.error && (
          <p role="alert" className="text-xs text-status-error">
            {create.error.message}
          </p>
        )}
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5.5">
          <span className="flex items-center justify-between gap-2.5">
            <h2 className="text-base font-semibold">Set up {project.name}</h2>
            {setup.data && (
              <ProgressMeter done={done} total={steps.length} label={`Set up ${project.name}`} />
            )}
          </span>
          <ul className="flex flex-col gap-1">
            {steps.map((step) => (
              <SetupRow key={step.label} step={step} />
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5.5">
          <h2 className="text-base font-semibold">More than one team here?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Give each team its own workspace, with separate people, keys and workflows. Anything set
            in Project settings still reaches every workspace.
          </p>
          <span className="flex flex-wrap gap-2.5" aria-hidden="true">
            <span className="flex items-center gap-2 rounded-[10px] bg-muted px-3 py-2 text-xs">
              <span
                className={cn(
                  'flex size-[18px] items-center justify-center rounded-[5px] text-3xs font-semibold',
                  WORKSPACE_TILE_CLASS[workspace.colour],
                )}
              >
                {workspace.initial}
              </span>
              {workspace.name}
            </span>
            <span className="flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <Plus className="size-3.5" />
              Finance team
            </span>
          </span>
          {canAddWorkspace && (
            <ShellLink
              href={`${projectSettingsPath(slugs, 'workspaces')}?new=workspace`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'mt-auto self-start',
              )}
            >
              Add a workspace
            </ShellLink>
          )}
        </section>
      </div>
    </>
  )
}
