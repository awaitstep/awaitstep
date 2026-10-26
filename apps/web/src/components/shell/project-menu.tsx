import { Check, Plus, Settings, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ShellLink } from '../ui/shell-link'
import { scopeTileColourClass } from '../ui/workspace-colour'
import type { ScopeTile } from './context-panel'
import { PanelItem, type PanelItemProps } from './panel-item'

export interface ProjectMenuWorkspace {
  key: string
  name: string
  /** Initial + swatch, the same tile the switchers draw. */
  tile: ScopeTile
  /** "4 workflows". */
  count: string
  href: string
  current?: boolean
}

interface ProjectMenuProps {
  project: { name: string; tile: ScopeTile; switchHref: string }
  workspaces: ProjectMenuWorkspace[]
  /** Omitted when the viewer can't create workspaces; the New tile is then hidden. */
  newWorkspaceHref?: string
  /** The current workspace's pages: Overview, Workflows, … Workspace settings. */
  nav: (PanelItemProps & { key: string })[]
  projectSettingsHref: string
  /** Called on Close and on every link, so the sheet doesn't stay up over the page it opened. */
  onClose: () => void
}

function WorkspaceTile({
  workspace,
  onSelect,
}: {
  workspace: ProjectMenuWorkspace
  onSelect: () => void
}) {
  return (
    <ShellLink
      href={workspace.href}
      onClick={onSelect}
      aria-current={workspace.current ? 'true' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5',
        workspace.current ? 'border-primary/60 bg-sidebar-accent' : 'border-border',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative flex size-7 shrink-0 items-center justify-center rounded-md text-2xs font-semibold',
          scopeTileColourClass(workspace.tile.colour),
        )}
      >
        {workspace.tile.initial}
        {workspace.current && (
          <Check
            size={12}
            className="absolute -bottom-1 -right-1 rounded-full bg-primary p-0.5 text-primary-foreground"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{workspace.name}</span>
        <span className="truncate text-2xs text-muted-foreground">{workspace.count}</span>
      </span>
    </ShellLink>
  )
}

/** The project panel on a phone, shown in a `BottomSheet`: project, workspaces, workspace pages. */
export function ProjectMenu({
  project,
  workspaces,
  newWorkspaceHref,
  nav,
  projectSettingsHref,
  onClose,
}: ProjectMenuProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <ShellLink
          href={project.switchHref}
          onClick={onClose}
          aria-label={`Project ${project.name}, switch project`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
              scopeTileColourClass(project.tile.colour),
            )}
          >
            {project.tile.initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-2xs text-muted-foreground">Project</span>
            <span className="truncate text-sm font-semibold text-foreground">{project.name}</span>
          </span>
          <span className="text-xs font-medium text-primary">Switch</span>
        </ShellLink>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="px-4 pb-2 pt-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Workspace
      </p>
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        {workspaces.map((workspace) => (
          <WorkspaceTile key={workspace.key} workspace={workspace} onSelect={onClose} />
        ))}
        {newWorkspaceHref && (
          <ShellLink
            href={newWorkspaceHref}
            onClick={onClose}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus size={14} aria-hidden="true" />
            New
          </ShellLink>
        )}
      </div>
      <nav
        aria-label="Workspace"
        className="flex flex-col gap-0.5 border-t border-border px-2.5 py-2"
      >
        {nav.map(({ key, ...item }) => (
          <PanelItem key={key} {...item} onSelect={onClose} />
        ))}
      </nav>
      <div className="border-t border-border px-2.5 py-2">
        <PanelItem
          href={projectSettingsHref}
          icon={Settings}
          label="Project settings"
          onSelect={onClose}
        />
      </div>
    </div>
  )
}
