import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import type { Theme } from '../../lib/theme'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { WorkspaceColour } from '../ui/workspace-colour'
import { orgPath, withOverlay } from '../../lib/dashboard-paths'
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
import { DashboardAccountMenu } from './account-menu-container'
import { MobileProjectMenu } from './mobile-project-menu'
import { TopBarSlotTarget } from './top-bar-slot'
import { OrgSwitcher } from './org-switcher'
import { ProjectSwitcher } from './project-switcher'
import { WorkspaceSwitcher } from './workspace-switcher'
import {
  breadcrumbs,
  panelModel,
  railModel,
  type RailOverlays,
  tabBarEntries,
  type LastProject,
  type NavItem,
  type PanelModel,
} from './nav-model'

/** What the frame shows of the scope the URL names. */
export interface FrameScope {
  slugs: ScopeSlugs
  org: { name: string; initial: string; logo: string | null }
  project?: { name: string; initial: string }
  workspace?: { name: string; initial: string; colour: WorkspaceColour }
}

export interface FrameViewer {
  name: string
  email: string
  image: string | null
}

interface DashboardFrameProps {
  scope: FrameScope
  /** The page being shown; null while landing or on a not-found page (no panel). */
  page: DashboardPage | null
  viewer: FrameViewer | null
  lastProject: LastProject | null
  /** Where the rail's Inbox and What's new open, and their markers. */
  overlays: RailOverlays
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
  overlays,
  theme,
  onToggleTheme,
  children,
}: DashboardFrameProps) {
  const rail = railModel(scope.slugs.org, page ?? { kind: 'org', page: 'projects' }, overlays)
  const whatsNewHref = withOverlay(overlays.here, 'whats-new')
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
          org={
            <OrgSwitcher
              trigger={
                <RailOrgButton
                  name={scope.org.name}
                  initial={scope.org.initial}
                  logo={scope.org.logo}
                />
              }
              current={{ slug: scope.slugs.org, name: scope.org.name }}
            />
          }
          primary={rail.primary}
          secondary={rail.secondary}
          activeKey={page ? rail.activeKey : undefined}
          theme={theme}
          onToggleTheme={onToggleTheme}
          account={
            viewer ? (
              <DashboardAccountMenu
                placement="rail"
                whatsNewHref={whatsNewHref}
                trigger={<RailAccountButton user={viewer} />}
                user={viewer}
                org={scope.slugs.org}
                theme={theme}
                onToggleTheme={onToggleTheme}
              />
            ) : null
          }
        />
      }
      panel={<FramePanel panel={panel} scope={scope} />}
      mobileHeader={
        <FrameMobileHeader
          panel={panel}
          scope={scope}
          viewer={viewer}
          whatsNewHref={whatsNewHref}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
      }
      tabBar={
        <MobileTabBar items={tabBarEntries(rail)} activeKey={page ? rail.activeKey : undefined} />
      }
    >
      <TopBar breadcrumbs={crumbs}>
        <TopBarSlotTarget />
      </TopBar>
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

/** The panel's project header: opens the project switcher. */
function ProjectHeader({ scope }: { scope: FrameScope }) {
  const project = scope.project!
  return (
    <ProjectSwitcher
      org={{ slug: scope.slugs.org, name: scope.org.name }}
      currentProject={scope.slugs.project}
      // The kit button itself: a popover trigger must receive its props and ref.
      trigger={
        <PanelScopeButton
          variant="header"
          scope="Project"
          name={project.name}
          tile={{ initial: project.initial }}
        />
      }
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
          header={<ProjectHeader scope={scope} />}
          footer={
            <PanelItem href={panel.projectSettingsHref} icon={Settings} label="Project settings" />
          }
        >
          <WorkspaceSwitcher
            slugs={panel.slugs}
            projectName={scope.project!.name}
            page={panel.page}
            trigger={
              <PanelScopeButton
                variant="card"
                scope="Workspace"
                name={scope.workspace!.name}
                tile={{ initial: scope.workspace!.initial, colour: scope.workspace!.colour }}
              />
            }
          />
          <NavSection items={panel.items} activeKey={panel.activeKey} />
        </ContextPanel>
      )
    case 'project-settings':
      return (
        <ContextPanel label="Project settings" header={<ProjectHeader scope={scope} />}>
          <PanelBackLink href={panel.backHref} label="Back to workspace" />
          <NavSection title="Project settings" items={panel.items} activeKey={panel.activeKey} />
        </ContextPanel>
      )
    case 'org-settings':
      return (
        <ContextPanel
          label="Organization settings"
          header={
            <PanelOrgHeader
              name={scope.org.name}
              initial={scope.org.initial}
              logo={scope.org.logo}
            />
          }
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
  whatsNewHref: string
  theme: Theme
  onToggleTheme: () => void
}

/** Below `md`: on workspace pages, back to projects and the project menu; elsewhere the org. */
function FrameMobileHeader({
  panel,
  scope,
  viewer,
  whatsNewHref,
  theme,
  onToggleTheme,
}: FrameMobileHeaderProps) {
  const account = viewer ? (
    <DashboardAccountMenu
      placement="phone"
      whatsNewHref={whatsNewHref}
      trigger={<RailAccountButton user={viewer} className="mt-0" />}
      user={viewer}
      org={scope.slugs.org}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  ) : null
  if (panel.mode === 'workspace') {
    return (
      <MobileHeader
        back={{ label: 'Back to projects', href: orgPath(scope.slugs.org) }}
        scope={
          <MobileProjectMenu
            slugs={panel.slugs}
            orgName={scope.org.name}
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
      org={
        <OrgSwitcher
          side="bottom"
          trigger={
            <MobileOrgButton
              name={scope.org.name}
              initial={scope.org.initial}
              logo={scope.org.logo}
            />
          }
          current={{ slug: scope.slugs.org, name: scope.org.name }}
        />
      }
      account={account}
    />
  )
}
