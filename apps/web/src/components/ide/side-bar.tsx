import type { ReactNode } from 'react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useIdeLayoutStore, type SideBarTab } from '../../stores/ide-layout-store'
import { SearchPanel } from './search-panel'
import { sideBarPanelId, sideBarTabId } from './side-bar-tabs'

interface SideBarProps {
  /** The Explorer view; kept mounted while Search shows, so its folds and focus survive. */
  explorer: ReactNode
  /** The Steps view; kept mounted like the others. */
  steps: ReactNode
  /** Every file as the editor has it, drafts included. */
  files: ReadonlyMap<string, GeneratedFile>
  /** Esc in either view: focus goes back to the editor. */
  onEscape: () => void
}

/** The left panel: Explorer, Search and Steps, one showing at a time. */
export function SideBar({ explorer, steps, files, onEscape }: SideBarProps) {
  const tab = useIdeLayoutStore((s) => s.sideBarTab)
  return (
    <div className="h-full bg-card">
      <SideBarPanel id="explorer" shown={tab === 'explorer'}>
        {explorer}
      </SideBarPanel>
      <SideBarPanel id="search" shown={tab === 'search'}>
        <SearchPanel files={files} active={tab === 'search'} onEscape={onEscape} />
      </SideBarPanel>
      <SideBarPanel id="steps" shown={tab === 'steps'}>
        {steps}
      </SideBarPanel>
    </div>
  )
}

function SideBarPanel({
  id,
  shown,
  children,
}: {
  id: SideBarTab
  shown: boolean
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={sideBarPanelId(id)}
      aria-labelledby={sideBarTabId(id, id)}
      hidden={!shown}
      className="h-full"
    >
      {children}
    </div>
  )
}
