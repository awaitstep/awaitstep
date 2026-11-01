import { useState } from 'react'
import {
  Activity,
  Bell,
  BookOpen,
  Box,
  Braces,
  CirclePlay,
  Code,
  House,
  KeyRound,
  Layers,
  LayoutGrid,
  Library,
  Plug,
  Settings,
  Share2,
  Sparkles,
  SquareTerminal,
  Users,
  Workflow,
} from 'lucide-react'
import {
  ContextPanel,
  PanelBackLink,
  PanelEmpty,
  PanelOrgHeader,
  PanelScopeButton,
} from '../../context-panel'
import { PanelItem, PanelSection } from '../../panel-item'
import { OrgRail, type RailEntry } from '../../org-rail'
import type { Theme } from '../../../../lib/theme'
import { RailAccountButton, RailOrgButton } from '../../rail-item'

// Canvas sample data (Acme Inc · Project 101 · Sales) shared by the shell's
// stories and tests. Hrefs follow the W1 route tree.

const ORG = '/acme'
const PROJECT = `${ORG}/project-101`
const WORKSPACE = `${PROJECT}/sales`

export const railPrimary: RailEntry[] = [
  { key: 'projects', href: `${ORG}/projects`, icon: House, label: 'Projects' },
  { key: 'resources', href: `${ORG}/resources`, icon: Box, label: 'Resources' },
  { key: 'audit', href: `${ORG}/audit`, icon: Activity, label: 'Audit log' },
  { key: 'settings', href: `${ORG}/settings/general`, icon: Settings, label: 'Settings' },
]

export const railSecondary: RailEntry[] = [
  {
    key: 'whats-new',
    href: `${ORG}/whats-new`,
    icon: Sparkles,
    label: "What's new",
    badge: { kind: 'dot', description: '2 updates since your last visit' },
  },
  {
    key: 'inbox',
    href: `${ORG}/inbox`,
    icon: Bell,
    label: 'Inbox',
    badge: { kind: 'count', value: 3, description: '3 unread notifications' },
  },
  { key: 'api', href: '/api-playground', icon: SquareTerminal, label: 'API' },
  {
    key: 'docs',
    href: 'https://docs.awaitstep.dev',
    icon: BookOpen,
    label: 'Docs',
    external: true,
  },
]

export function SampleRail({ activeKey }: { activeKey?: string }) {
  const [theme, setTheme] = useState<Theme>('dark')

  function handleToggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <OrgRail
      org={<RailOrgButton name="Acme Inc" initial="A" />}
      primary={railPrimary}
      secondary={railSecondary}
      activeKey={activeKey}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      account={<RailAccountButton user={{ name: 'Ama Mensah', email: 'ama@acme.test' }} />}
    />
  )
}

function ProjectHeader() {
  return (
    <PanelScopeButton variant="header" scope="Project" name="Project 101" tile={{ initial: 'P' }} />
  )
}

export const workspaceItems = [
  { key: 'overview', href: `${WORKSPACE}/overview`, icon: LayoutGrid, label: 'Overview' },
  { key: 'workflows', href: `${WORKSPACE}/workflows`, icon: Workflow, label: 'Workflows' },
  { key: 'functions', href: `${WORKSPACE}/functions`, icon: Code, label: 'Functions' },
  { key: 'library', href: `${WORKSPACE}/library`, icon: Library, label: 'Library' },
  { key: 'runs', href: `${WORKSPACE}/runs`, icon: CirclePlay, label: 'Runs' },
  { key: 'wsettings', href: `${WORKSPACE}/settings`, icon: Settings, label: 'Workspace settings' },
]

export function WorkspacePanel({ active }: { active?: string }) {
  return (
    <ContextPanel
      label="Project"
      header={<ProjectHeader />}
      footer={
        <PanelItem
          href={`${PROJECT}/workspaces`}
          icon={Layers}
          label="Project"
          active={active === 'project'}
        />
      }
    >
      <PanelScopeButton
        variant="card"
        scope="Workspace"
        name="Sales"
        tile={{ initial: 'S', colour: 'green' }}
      />
      <PanelSection>
        {workspaceItems.map(({ key, ...item }) => (
          <PanelItem key={key} {...item} active={key === active} />
        ))}
      </PanelSection>
    </ContextPanel>
  )
}

const projectItems = [
  { key: 'workspaces', href: `${PROJECT}/workspaces`, icon: Layers, label: 'Workspaces' },
  { key: 'shared', href: `${PROJECT}/shared`, icon: Share2, label: 'Shared library' },
  { key: 'members', href: `${PROJECT}/members`, icon: Users, label: 'Members' },
  { key: 'keys', href: `${PROJECT}/api-keys`, icon: KeyRound, label: 'API keys' },
  { key: 'variables', href: `${PROJECT}/variables`, icon: Braces, label: 'Variables' },
  { key: 'settings', href: `${PROJECT}/settings`, icon: Settings, label: 'Settings' },
]

/** The project's menu: its pages in one list, no heading and no way back to a workspace. */
export function ProjectSettingsPanel({ active }: { active?: string }) {
  return (
    <ContextPanel label="Project" header={<ProjectHeader />}>
      <div className="pt-3">
        <PanelSection>
          {projectItems.map(({ key, ...item }) => (
            <PanelItem key={key} {...item} active={key === active} />
          ))}
        </PanelSection>
      </div>
    </ContextPanel>
  )
}

const orgSettingsItems = [
  { key: 'general', href: `${ORG}/settings/general`, icon: Settings, label: 'General' },
  { key: 'members', href: `${ORG}/settings/members`, icon: Users, label: 'Members' },
  { key: 'connections', href: `${ORG}/settings/connections`, icon: Plug, label: 'Connections' },
  { key: 'keys', href: `${ORG}/settings/api-keys`, icon: KeyRound, label: 'API keys' },
]

export function OrgSettingsPanel({ active }: { active?: string }) {
  return (
    <ContextPanel
      label="Organization settings"
      header={<PanelOrgHeader name="Acme Inc" initial="A" />}
    >
      <PanelBackLink href={`${WORKSPACE}/workflows`} label="Back to Project 101" />
      <PanelSection title="Organization settings">
        {orgSettingsItems.map(({ key, ...item }) => (
          <PanelItem key={key} {...item} active={key === active} />
        ))}
      </PanelSection>
    </ContextPanel>
  )
}

export function NoProjectPanel() {
  return (
    <ContextPanel
      label="Project"
      header={<span className="px-3.5 text-xs text-muted-foreground">No project yet</span>}
    >
      <PanelEmpty
        message="Workflows live in a project. Create one to get a workspace and this menu."
        action={{ href: `${ORG}/projects?new=project`, label: 'Create a project' }}
      />
    </ContextPanel>
  )
}
