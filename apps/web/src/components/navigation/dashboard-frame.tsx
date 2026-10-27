import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import type { Theme } from '../../lib/theme'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { WorkspaceColour } from '../ui/workspace-colour'
import { orgPath } from '../../lib/dashboard-paths'
import { AppShell } from '../shell/app-shell'
import {
  ContextPanel,
  PanelBackLink,
  PanelOrgHeader,
  PanelScopeButton,
} from '../shell/context-panel'
import { MobileHeader, MobileOrgButton, MobileTabBar } from '../shell/mobile-nav'
import { OrgRail } from '../shell/org-rail'
import { PanelItem, PanelSection } from '../shell/panel-item'
import { RailAccountButton, RailOrgButton } from '../shell/rail-item'
import { TopBar } from '../shell/top-bar'
import type { DashboardPage } from './dashboard-page'
import { MobileProjectMenu } from './mobile-project-menu'
import {
  breadcrumbs,
  panelModel,
  railModel,
  tabBarEntries,
  type LastProject,
  type NavItem,
  type PanelModel,
} from './nav-model'

/** What the frame shows of the scope the URL names. */
export interface FrameScope {
  slugs: ScopeSlugs
  org: { name: string; initial: string }
  project?: { name: string; initial: string }
  workspace?: { name: string; initial: string; colour: WorkspaceColour }
}

export interface FrameViewer {
  name: string
  email: string
}

interface DashboardFrameProps {
  scope: FrameScope
  /** The page being shown; null while landing or on a not-found page (no panel). */
  page: DashboardPage | null
  viewer: FrameViewer | null
  lastProject: LastProject | null
  theme: Theme
  onToggleTheme: () => void
  children: ReactNode
}

/**
 * The dashboard's rail, context panel and top bar around a page. The scope
 * buttons and account avatar open nothing yet: the switchers and account menu
 * are N2.
 */
export function DashboardFrame({
  scope,
  page,
  viewer,
  lastProject,
  theme,
  onToggleTheme,
  children,
}: DashboardFrameProps) {
  const rail = railModel(scope.slugs.org, page ?? { kind: 'org', page: 'projects' })
  const panel = page ? panelModel(page, scope.slugs, lastProject) : { mode: 'none' as const }
  const crumbs = page
    ? breadcrumbs(page, scope.slugs, {
        org: scope.org.name,
        project: scope.project?.name,
        workspace: scope.workspace?.name,
      })
    : [{ label: scope.org.name }]

  return (
    <AppShell
      rail={
        <OrgRail
          org={<RailOrgButton name={scope.org.name} initial={scope.org.initial} />}
          primary={rail.primary}
          secondary={rail.secondary}
          activeKey={page ? rail.activeKey : undefined}
          theme={theme}
          onToggleTheme={onToggleTheme}
          account={viewer ? <RailAccountButton user={viewer} /> : null}
        />
      }
      panel={<FramePanel panel={panel} scope={scope} />}
      mobileHeader={<FrameMobileHeader panel={panel} scope={scope} viewer={viewer} />}
      tabBar={
        <MobileTabBar items={tabBarEntries(rail)} activeKey={page ? rail.activeKey : undefined} />
      }
    >
      <TopBar breadcrumbs={crumbs} />
      {children}
    </AppShell>
  )
}

function NavSection({
  title,
  items,
  activeKey,
}: {
  title?: string
  items: NavItem[]
  activeKey: string
}) {
  return (
    <PanelSection title={title}>
      {items.map(({ key, ...item }) => (
        <PanelItem key={key} {...item} active={key === activeKey} />
      ))}
    </PanelSection>
  )
}

function ProjectHeader({ project }: { project: NonNullable<FrameScope['project']> }) {
  return (
    <PanelScopeButton
      variant="header"
      scope="Project"
      name={project.name}
      tile={{ initial: project.initial }}
    />
  )
}

function FramePanel({ panel, scope }: { panel: PanelModel; scope: FrameScope }) {
  switch (panel.mode) {
    case 'none':
      return null
    case 'workspace':
      return (
        <ContextPanel
          label="Project"
          header={<ProjectHeader project={scope.project!} />}
          footer={
            <PanelItem href={panel.projectSettingsHref} icon={Settings} label="Project settings" />
          }
        >
          <PanelScopeButton
            variant="card"
            scope="Workspace"
            name={scope.workspace!.name}
            tile={{ initial: scope.workspace!.initial, colour: scope.workspace!.colour }}
          />
          <NavSection items={panel.items} activeKey={panel.activeKey} />
        </ContextPanel>
      )
    case 'project-settings':
      return (
        <ContextPanel label="Project settings" header={<ProjectHeader project={scope.project!} />}>
          <PanelBackLink href={panel.backHref} label="Back to workspace" />
          <NavSection title="Project settings" items={panel.items} activeKey={panel.activeKey} />
        </ContextPanel>
      )
    case 'org-settings':
      return (
        <ContextPanel
          label="Organization settings"
          header={<PanelOrgHeader name={scope.org.name} initial={scope.org.initial} />}
        >
          <PanelBackLink href={panel.back.href} label={panel.back.label} />
          <NavSection
            title="Organization settings"
            items={panel.items}
            activeKey={panel.activeKey}
          />
        </ContextPanel>
      )
  }
}

interface FrameMobileHeaderProps {
  panel: PanelModel
  scope: FrameScope
  viewer: FrameViewer | null
}

/** Below `md`: on workspace pages, back to projects and the project menu; elsewhere the org. */
function FrameMobileHeader({ panel, scope, viewer }: FrameMobileHeaderProps) {
  const account = viewer ? <RailAccountButton user={viewer} className="mt-0" /> : null
  if (panel.mode === 'workspace') {
    return (
      <MobileHeader
        back={{ label: 'Back to projects', href: orgPath(scope.slugs.org) }}
        scope={
          <MobileProjectMenu
            slugs={scope.slugs as Required<FrameScope['slugs']>}
            project={scope.project!}
            workspace={scope.workspace!}
            nav={panel.items}
            activeKey={panel.activeKey}
            projectSettingsHref={panel.projectSettingsHref}
          />
        }
        account={account}
      />
    )
  }
  return (
    <MobileHeader
      org={<MobileOrgButton name={scope.org.name} initial={scope.org.initial} />}
      account={account}
    />
  )
}
