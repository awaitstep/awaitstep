import { useState } from 'react'
import { BottomSheet } from '../../../ui/bottom-sheet'
import { MobileHeader, MobileOrgButton, MobileScopeButton, MobileTabBar } from '../../mobile-nav'
import type { RailEntry } from '../../org-rail'
import { ProjectMenu, type ProjectMenuWorkspace } from '../../project-menu'
import { RailAccountButton } from '../../rail-item'
import { railPrimary, railSecondary, workspaceItems } from './frame'

// The phone frame's sample data: the rail's entries cut to five tabs, and
// Project 101's workspaces for the project menu.

const PROJECT = '/acme/project-101'

const inbox = railSecondary.find((entry) => entry.key === 'inbox') as RailEntry

export const mobileTabs: RailEntry[] = [
  ...railPrimary.filter((entry) => entry.key !== 'settings'),
  inbox,
  railPrimary.find((entry) => entry.key === 'settings') as RailEntry,
]

export const menuWorkspaces: ProjectMenuWorkspace[] = [
  {
    key: 'sales',
    name: 'Sales',
    tile: { initial: 'S', colour: 'green' },
    count: '4 workflows',
    href: `${PROJECT}/sales/workflows`,
    current: true,
  },
  {
    key: 'it',
    name: 'IT',
    tile: { initial: 'I', colour: 'blue' },
    count: '6 workflows',
    href: `${PROJECT}/it/workflows`,
  },
  {
    key: 'support',
    name: 'Support',
    tile: { initial: 'S', colour: 'amber' },
    count: '2 workflows',
    href: `${PROJECT}/support/workflows`,
  },
]

function SampleAccount() {
  return (
    <RailAccountButton
      user={{ name: 'Ama Mensah', email: 'ama@acme.test' }}
      className="mx-1.5 mt-0 flex size-11 items-center justify-center"
    />
  )
}

export function SampleTabBar({ activeKey = 'projects' }: { activeKey?: string }) {
  return <MobileTabBar items={mobileTabs} activeKey={activeKey} />
}

export function OrgMobileHeader() {
  return (
    <MobileHeader
      org={<MobileOrgButton name="Acme Inc" initial="A" />}
      account={<SampleAccount />}
    />
  )
}

export function WorkspaceMobileHeader({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)

  function handleClose() {
    setOpen(false)
  }

  return (
    <MobileHeader
      back={{ label: 'Back to projects', href: '/acme/projects' }}
      scope={
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Project menu"
          trigger={
            <MobileScopeButton
              project="Project 101"
              workspace="Sales"
              tile={{ initial: 'S', colour: 'green' }}
            />
          }
        >
          <ProjectMenu
            project={{ name: 'Project 101', tile: { initial: 'P' }, switchHref: '/acme/projects' }}
            workspaces={menuWorkspaces}
            newWorkspaceHref={`${PROJECT}/settings/workspaces?new=workspace`}
            nav={workspaceItems.map((item) => ({ ...item, active: item.key === 'workflows' }))}
            projectSettingsHref={`${PROJECT}/settings/workspaces`}
            onClose={handleClose}
          />
        </BottomSheet>
      }
      account={<SampleAccount />}
    />
  )
}
