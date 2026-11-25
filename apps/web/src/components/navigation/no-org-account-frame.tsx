import type { ReactElement, ReactNode } from 'react'
import { useViewer } from '../../data/dashboard/session'
import { handleSignOut } from '../../lib/auth-client'
import { EntryFrame } from '../orgs/parts/entry-frame'
import { EntryAccountMenu } from './account-menu-container'
import { TopBarSlotProvider, TopBarSlotTarget } from './top-bar-slot'

/**
 * Your account's pages for someone in no organization: /dashboard's frame (no
 * org rail to borrow) around the page.
 */
export function NoOrgAccountFrame({ children }: { children: ReactNode }) {
  const viewer = useViewer()

  function renderAccountMenu(trigger: ReactElement) {
    return viewer.data && <EntryAccountMenu trigger={trigger} user={viewer.data} />
  }

  function handleSignOutClick() {
    void handleSignOut()
  }

  // The page's top-bar controls (About you's Save) land in this frame's header.
  return (
    <TopBarSlotProvider>
      <EntryFrame
        account={viewer.data ?? null}
        accountMenu={renderAccountMenu}
        actions={<TopBarSlotTarget />}
        onSignOut={handleSignOutClick}
      >
        {children}
      </EntryFrame>
    </TopBarSlotProvider>
  )
}
